/**
 * The lecture plugin's routes under `/__presmium/presmium.lecture/`
 * (docs/architecture.md 4.7): readers list and play the recorded lectures;
 * editors record. A recording uploads its media as it goes, a chunk every
 * few seconds, each written at its byte position (the WebM muxer writes its
 * header last), then sends the track.
 *
 *   GET  tracks                                the lectures: id, length, voice, language, number of utterances
 *   GET  tracks/<id>                           track.json; `script`, the synthesized lecture, made on an editor's demand
 *   GET  tracks/<id>/<audio|video>/<file>      a media file, with ranges (seeking)
 *   GET  tracks/<id>/clips/<key>.<wav|ogg>     a synthesized clip, from the synthesis cache
 *   POST recordings          { track? }        a new lecture, or one to record a section of again: { id }
 *   POST recordings/<id>/media  { folder, section, kind?, ext }   a free file name: { src }
 *   PUT  recordings/<id>/files/<src>?at=<n>    bytes written at position n
 *   POST recordings/<id>/finish  { head, recording, section? }    writes track.json: { id, track }
 *
 * Synthesis is paid, so only an editor's request makes `script` with the
 * engine: a reader gets the one made for the latest IR, else what the cache
 * alone gives when no engine can synthesize the voice, else the last one made.
 *
 * Editors also work on a recorded lecture's words (WP-83), each change
 * written to its track.json, which comes back:
 *
 *   GET  speech[?engine=<id>]                  the engines: transcription and synthesis (the deck's, or <id>), with providers and voices
 *   POST editing/<id>/transcribe               its audio transcribed: utterances, events bound to words
 *   PUT  editing/<id>/utterances/<u> { text }  an utterance's text corrected (said again in a synthetic voice)
 *   POST editing/<id>/synthesize { voice, engine? }   every utterance said again in a voice
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { DOCUMENT_FILES, errorMessage, isRecord, SPEECH } from '@presmium/kernel'
import type { IRDocument, Member, Route, ServerContext, ServerContribution, SpeechService } from '@presmium/kernel'
import { CLIPS_DIR, editUtterance, fileStem, lectureVoice, lexiconOf, recordedTrack, resynthesizedTrack, SCRIPT_TRACK, spliceSection, trackDuration } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, Recording, TrackHead, Voice } from '../domain/index.ts'
import { clipFile, synthesisEngineOf, synthesizedLecture, transcribeLecture, transcriptionEngine, unsaidMessage } from './lecture.ts'
import { latestDoc, latestView, lectureConfig } from './plan.ts'
import type { MadeClip } from './speak.ts'
import { clipVoice, synthesizeClip } from './speak.ts'
import { deckFiles, freeMediaPath, mediaFile, mediaPolicy, newTrackId, readTrack, sha256File, trackDir, trackIds, writeGitFiles, writeTrack } from './store.ts'
import type { MediaPolicy } from './store.ts'

/** The largest chunk a recording uploads at once, and the largest media file. */
const MAX_CHUNK = 64 * 1024 * 1024
const MAX_FILE = 4 * 1024 * 1024 * 1024

const TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
}

/** Thrown to answer with a status and a message. */
class Refusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function problem(status: number, message: string): Response {
  return json({ error: message }, status)
}

/** A path from its URL segments; '' when one is malformed. */
function decoded(segments: string[]): string {
  try {
    return segments.map(decodeURIComponent).join('/')
  } catch {
    return ''
  }
}

/** A media file, whole or the byte range the request asks for (media elements seek with ranges), streamed. */
function serveFile(file: string, request: Request): Response {
  const size = statSync(file).size
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const body = (start: number, end: number) => Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || (!range[1] && !range[2])) return new Response(size ? body(0, size - 1) : null, { headers: { ...headers, 'Content-Length': String(size) } })
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  return new Response(body(start, end), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
}

/** The media of a finished recording as the track refers to it: with its hash, under the external URL of the policy. */
function published<T extends MediaSegment>(deckDir: string, id: string, segments: T[], policy: MediaPolicy): Promise<T[]> {
  return Promise.all(segments.map(async (segment) => {
    const file = mediaFile(deckDir, id, segment.src)
    const sha256 = file && existsSync(file) ? await sha256File(file) : undefined
    const src = policy.kind === 'url' && file ? `${policy.prefix}${id}/${segment.src}` : segment.src
    return { ...segment, src, ...sha256 ? { sha256 } : {} }
  }))
}

function readRecording(value: unknown): Recording | undefined {
  if (!isRecord(value) || !Array.isArray(value.events)) return undefined
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    events: value.events as Recording['events'],
    audio: list(value.audio) as Recording['audio'],
    video: list(value.video) as Recording['video'],
    utterances: list(value.utterances) as Recording['utterances'],
    duration: typeof value.duration === 'number' ? value.duration : 0,
  }
}

function readHead(value: unknown, id: string): TrackHead | undefined {
  if (!isRecord(value) || typeof value.doc !== 'string' || typeof value.irHash !== 'string') return undefined
  return {
    id,
    doc: value.doc,
    lang: typeof value.lang === 'string' ? value.lang : 'zh-CN',
    irHash: value.irHash,
    sections: isRecord(value.sections) ? Object.fromEntries(Object.entries(value.sections).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
    voice: isRecord(value.voice) && value.voice.kind === 'recorded'
      ? { kind: 'recorded', ...typeof value.voice.speaker === 'string' ? { speaker: value.voice.speaker } : {} }
      : { kind: 'recorded' },
    blocks: isRecord(value.blocks) ? value.blocks as TrackHead['blocks'] : {},
  }
}

export function lectureServer(ctx: ServerContext): ServerContribution {
  const { deckDir } = ctx
  const policy = mediaPolicy(ctx.settings)
  // Written through the workspace's writer in `presmium serve` (in SHARED mode by agent-host, as the sandbox; WP-91).
  const files = deckFiles(ctx.workspaceRoot, () => ctx.service(DOCUMENT_FILES))

  const finish = async (id: string, request: Request): Promise<Response> => {
    const body: unknown = await request.json().catch(() => undefined)
    const recording = isRecord(body) ? readRecording(body.recording) : undefined
    const head = isRecord(body) ? readHead(body.head, id) : undefined
    if (!recording || !head) return problem(400, 'expected { head, recording }')
    const media = { ...recording, audio: await published(deckDir, id, recording.audio, policy), video: await published(deckDir, id, recording.video, policy) }
    const section = isRecord(body) && typeof body.section === 'string' ? body.section : undefined
    const stored = readTrack(deckDir, id)
    let track: LectureTrack
    if (section && stored) {
      const spliced = spliceSection(stored.track, section, media, head)
      track = spliced.track
      // The media of the section's earlier recording, by its path in the lecture's directory.
      const external = policy.kind === 'url' ? `${policy.prefix}${id}/` : undefined
      for (const src of spliced.unused) {
        const file = mediaFile(deckDir, id, external && src.startsWith(external) ? src.slice(external.length) : src)
        if (file) await files.remove(file)
      }
    } else {
      track = recordedTrack(head, media)
    }
    await writeTrack(files, deckDir, track)
    ctx.log.info(`lecture ${id}: ${track.events.length} events, ${(trackDuration(track) / 1000).toFixed(1)} s`)
    return json({ id, track })
  }

  const recordings: Route = {
    async handle(request, { rest }) {
      const [id = '', action, ...path] = rest.split('/')
      const dir = trackDir(deckDir, id)
      if (!dir) return problem(404, 'no such lecture')
      try {
        if (action === 'media' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => undefined)
          if (!isRecord(body) || (body.folder !== 'audio' && body.folder !== 'video') || typeof body.section !== 'string' || typeof body.ext !== 'string' || !/^(ogg|webm|mp4|m4a)$/.test(body.ext)) {
            return problem(400, 'expected { folder, section, ext }')
          }
          const stem = typeof body.kind === 'string' ? `${fileStem(body.section)}.${fileStem(body.kind)}` : fileStem(body.section)
          return json({ src: freeMediaPath(deckDir, id, body.folder, stem, body.ext) })
        }
        if (action === 'files' && request.method === 'PUT') {
          const file = mediaFile(deckDir, id, decoded(path))
          const at = Number(new URL(request.url).searchParams.get('at') ?? '0')
          if (!file || !Number.isSafeInteger(at) || at < 0) return problem(400, 'expected a media file of the lecture and ?at=<position>')
          // A chunk extends the file or rewrites what it has (a muxer's header), never leaves a gap.
          const size = existsSync(file) ? statSync(file).size : 0
          if (at > size) return problem(400, `?at=${at} is past the end of the file (${size} bytes)`)
          const bytes = new Uint8Array(await request.arrayBuffer())
          if (bytes.byteLength > MAX_CHUNK || at + bytes.byteLength > MAX_FILE) return problem(413, 'chunk too large')
          await files.write(file, bytes, at)
          return json({ written: bytes.byteLength })
        }
        if (action === 'finish' && request.method === 'POST') return await finish(id, request)
      } catch (error) {
        ctx.log.error(`lecture ${id}: ${errorMessage(error)}`)
        return problem(500, errorMessage(error))
      }
      return problem(404, 'unknown recording action')
    },
  }

  const speech = (): SpeechService => {
    const found = ctx.service(SPEECH)
    if (!found) throw new Refusal(503, 'no speech service: add @presmium/slidev-addon-speech to the deck\'s plugins')
    return found
  }
  /** The lecture renderer's view of the latest IR, which the lecture is planned from as a build plans it. */
  const compiled = (): IRDocument => {
    const doc = latestView(deckDir)
    if (!doc) throw new Refusal(503, 'the deck has not compiled yet')
    return doc
  }
  const lexicon = lexiconOf(ctx.config)

  /** The deck's synthesized lecture: with `lookup`, from the cache alone (no clip transcribed to align it). */
  const synthesize = (doc: IRDocument, lookup: boolean): Promise<LectureTrack> => synthesizedLecture(doc, deckDir, speech(), undefined, { lookup, files }).then(({ deck, track, unsaid }) => {
    if (!deck.voice) throw new Refusal(404, `no lecture ${SCRIPT_TRACK}: renderers.lecture.voice names no voice`)
    if (!track) throw new Refusal(502, unsaid.map(unsaidMessage).join('\n'))
    return track
  })
  /** The synthesized lecture of the latest IR, made once per IR (a lookup-made one serves lookups only), and the last one made. */
  let synthesized: { doc: IRDocument, made: Promise<LectureTrack>, lookup: boolean } | undefined
  let last: LectureTrack | undefined
  const made = (doc: IRDocument, lookup: boolean): Promise<LectureTrack> => {
    if (synthesized?.doc === doc && (!synthesized.lookup || lookup)) return synthesized.made
    const making = synthesize(doc, lookup)
    synthesized = { doc, made: making, lookup }
    making.then((track) => {
      last = track
    }, () => {
      if (synthesized?.made === making) synthesized = undefined
    })
    return making
  }
  const scriptTrack = async (member: Member): Promise<LectureTrack> => {
    const doc = compiled()
    if (member.roles.some(role => role === 'editor' || role === 'owner')) return made(doc, false)
    // A reader's request spends nothing: the cache alone when no engine can synthesize the voice (each clip a lookup).
    if (synthesized?.doc === doc) return synthesized.made
    if (!(await synthesisEngineOf(speech(), doc, voiced()?.engine))) {
      try {
        return await made(doc, true)
      } catch (error) {
        if (!last) throw error
      }
    }
    if (last) return last
    throw new Refusal(409, `lecture ${SCRIPT_TRACK} is synthesized when an editor opens it (synthesis is paid)`)
  }
  /** The voice the deck names, so `script` is its synthesized lecture. */
  const voiced = () => {
    const doc = latestDoc(deckDir)
    return doc ? lectureVoice(lectureConfig(doc)) : undefined
  }

  /** A stored lecture to work on. */
  const stored = (id: string): LectureTrack => {
    const found = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
    if (!found) throw new Refusal(404, `no lecture ${id}`)
    return found.track
  }
  const save = async (track: LectureTrack, extra: Record<string, unknown> = {}) => {
    await writeTrack(files, deckDir, track)
    return json({ ...extra, track })
  }
  /** The track with its utterances (those of `only`, else all) said again in `voice`. */
  const resynthesize = async (track: LectureTrack, voice: { engine?: string, voice: string }, only?: string): Promise<LectureTrack> => {
    const clips = new Map<string, MadeClip>()
    for (const u of track.utterances) {
      if (only && u.id !== only) continue
      clips.set(u.id, await synthesizeClip(speech(), { text: u.text, spoken: u.text, spans: [] }, { voice, lang: track.lang, ...lexicon ? { lexicon } : {}, files }))
    }
    const said: Voice = clips.size ? clipVoice(clips.values(), voice) : track.voice
    return resynthesizedTrack(track, clips, said)
  }

  const editing: Route = {
    async handle(request, { rest }) {
      const [id = '', action, ...path] = rest.split('/')
      try {
        const track = stored(id)
        if (action === 'transcribe' && request.method === 'POST') {
          if (!(await transcriptionEngine(speech(), latestDoc(deckDir)))) throw new Refusal(503, 'no speech engine transcribes: the operator defines one (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER)')
          const { track: transcribed, bound, provider } = await transcribeLecture(files, deckDir, track.id, speech(), latestDoc(deckDir), request.signal)
          ctx.log.info(`lecture ${id}: transcribed by ${provider}, ${transcribed.utterances.length} utterances, ${bound} events bound to words`)
          return json({ provider, bound, track: transcribed })
        }
        if (action === 'utterances' && request.method === 'PUT' && path.length === 1) {
          const body: unknown = await request.json().catch(() => undefined)
          if (!isRecord(body) || typeof body.text !== 'string' || !body.text.trim()) throw new Refusal(400, 'expected { text }')
          const edited = editUtterance(track, decoded(path), body.text)
          if (!edited) throw new Refusal(404, `lecture ${id} has no utterance ${decoded(path)}`)
          // A synthetic voice says the new text at once.
          const { voice } = track
          return await save(voice.kind === 'synthetic' ? await resynthesize(edited, { engine: voice.engine, voice: voice.voice }, decoded(path)) : edited)
        }
        if (action === 'synthesize' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => undefined)
          if (!isRecord(body) || typeof body.voice !== 'string' || !body.voice) throw new Refusal(400, 'expected { voice, engine? }')
          if (track.utterances.length === 0) throw new Refusal(409, `lecture ${id} has no utterances to say: transcribe it first`)
          const engine = typeof body.engine === 'string' && body.engine ? body.engine : undefined
          return await save(await resynthesize(track, { ...engine ? { engine } : {}, voice: body.voice }))
        }
        return problem(404, 'unknown editing action')
      } catch (error) {
        if (error instanceof Refusal) return problem(error.status, error.message)
        ctx.log.error(`lecture ${id}: ${errorMessage(error)}`)
        return problem(502, errorMessage(error))
      }
    },
  }

  return {
    routes: {
      'tracks': {
        role: 'reader',
        handle() {
          const doc = latestDoc(deckDir)
          const voice = voiced()
          const synthetic = voice && doc ? [{ id: SCRIPT_TRACK, lang: doc.meta.lang ?? 'zh-CN', voice: { kind: 'synthetic', ...voice } }] : []
          return json([...synthetic, ...trackIds(deckDir).filter(id => !(voice && id === SCRIPT_TRACK)).flatMap((id) => {
            try {
              const { track } = readTrack(deckDir, id)!
              return [{ id, lang: track.lang, voice: track.voice, duration: trackDuration(track), utterances: track.utterances.length }]
            } catch {
              return []
            }
          })])
        },
      },
      'tracks/*': {
        role: 'reader',
        async handle(request, { rest, member }) {
          const [id = '', ...path] = rest.split('/')
          try {
            if (path.length === 0) {
              if (id === SCRIPT_TRACK && voiced()) return json(await scriptTrack(member))
              const found = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
              return found ? json(found.track) : problem(404, `no lecture ${id}`)
            }
            if (path[0] === CLIPS_DIR && path.length === 2) {
              const clip = clipFile(deckDir, decoded(path.slice(1)))
              return clip && existsSync(clip) ? serveFile(clip, request) : problem(404, 'no such clip')
            }
          } catch (error) {
            return error instanceof Refusal ? problem(error.status, error.message) : problem(500, errorMessage(error))
          }
          const file = mediaFile(deckDir, id, decoded(path))
          return file && existsSync(file) ? serveFile(file, request) : problem(404, 'no such file')
        },
      },
      'speech': {
        async handle(request) {
          try {
            const service = speech()
            const doc = latestDoc(deckDir)
            // `?engine=`: the synthesis engine of a voice (a synthetic track's), with its provider as the operator names it now (N-08).
            const engine = new URL(request.url).searchParams.get('engine') || undefined
            const [transcribe, synthesize] = await Promise.all([transcriptionEngine(service, doc), synthesisEngineOf(service, doc, engine)])
            const voices = synthesize ? await service.voices(synthesize.id, doc?.meta.lang).catch(() => []) : []
            const info = (e: typeof transcribe) => e && { engine: e.id, provider: e.provider, local: e.local }
            return json({ transcribe: info(transcribe), synthesize: synthesize && { ...info(synthesize), voices } })
          } catch (error) {
            return error instanceof Refusal ? problem(error.status, error.message) : problem(502, errorMessage(error))
          }
        },
      },
      'editing/*': editing,
      'recordings': {
        async handle(request) {
          if (request.method !== 'POST') return problem(405, 'POST to start a recording')
          const body: unknown = await request.json().catch(() => ({}))
          const existing = isRecord(body) && typeof body.track === 'string' ? body.track : undefined
          if (existing && !readTrack(deckDir, existing)) return problem(404, `no lecture ${existing}`)
          const id = existing ?? newTrackId(deckDir)
          await writeGitFiles(files, trackDir(deckDir, id)!, policy)
          return json({ id })
        },
      },
      'recordings/*': recordings,
    },
  }
}
