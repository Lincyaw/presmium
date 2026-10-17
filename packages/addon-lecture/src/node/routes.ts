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
 * Editors and owners get the lectures of the whole deck; readers those of
 * its student view (P-55, D17): `script` said from the student view's plan,
 * a recorded lecture without what was said and done in the sections and
 * blocks the view leaves out or does not have (`viewTrack`: a section
 * relabeled since the recording is left out too), and only the clips and
 * media of what they get. What a reader is told of a failure quotes nothing said.
 * Files are read as they are opened, never through a link (`openInDeck`).
 *
 * Synthesis is paid, so only an editor's request makes `script` with the
 * engine (the whole deck's, then the students' from the same clips): a
 * reader gets the one made for the latest IR, else what the cache alone
 * gives when no engine can synthesize the voice, else the last one made.
 *
 * Editors also work on a recorded lecture's words (WP-83), each change
 * written to its track.json, which comes back:
 *
 *   GET  speech[?engine=<id>]                  the engines: transcription and synthesis (the deck's, or <id>), with providers and voices
 *   POST editing/<id>/transcribe               its audio transcribed: utterances, events bound to words
 *   PUT  editing/<id>/utterances/<u> { text }  an utterance's text corrected (said again in a synthetic voice)
 *   POST editing/<id>/synthesize { voice, engine? }   every utterance said again in a voice
 */
import { closeSync, createReadStream, existsSync, fstatSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { DOCUMENT_FILES, errorMessage, isRecord, json, problem, SPEECH } from '@presmium/kernel'
import type { IRDocument, Member, Route, ServerContext, ServerContribution, SpeechService } from '@presmium/kernel'
import { CLIPS_DIR, editUtterance, fileStem, lectureVoice, lexiconOf, recordedTrack, resynthesizedTrack, SCRIPT_TRACK, spliceSection, trackDuration, viewTrack } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, Recording, TrackHead, Voice } from '../domain/index.ts'
import { clipFile, synthesisEngineOf, synthesizedLecture, transcribeLecture, transcriptionEngine, unsaidMessage } from './lecture.ts'
import { latestDoc, latestView, lectureConfig } from './plan.ts'
import type { DeckView } from './plan.ts'
import type { MadeClip } from './speak.ts'
import { clipVoice, synthesizeClip } from './speak.ts'
import { deckFiles, freeMediaPath, mediaFile, mediaPolicy, newTrackId, openInDeck, publishedMedia, readTrack, sha256File, trackDir, trackIds, writeGitFiles, writeTrack } from './store.ts'

/** The largest chunk a recording uploads at once (and the body of its routes), and the largest media file. */
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

/** A path from its URL segments; '' when one is malformed. */
function decoded(segments: string[]): string {
  try {
    return segments.map(decodeURIComponent).join('/')
  } catch {
    return ''
  }
}

/**
 * A media file of the deck, whole or the byte range the request asks for
 * (media elements seek with ranges), streamed from the very file opened
 * (`openInDeck`); 404 for any other.
 */
function serveFile(deckDir: string, file: string | undefined, request: Request): Response {
  const fd = file === undefined ? undefined : openInDeck(deckDir, file)
  if (fd === undefined) return problem(404, 'no such file')
  const { size } = fstatSync(fd)
  const headers = { 'Content-Type': TYPES[extname(file!)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const body = (start: number, end: number) => Readable.toWeb(createReadStream('', { fd, start, end })) as ReadableStream<Uint8Array>
  const empty = (response: Response) => {
    closeSync(fd)
    return response
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range || (!range[1] && !range[2])) {
    if (size === 0 || request.method === 'HEAD') return empty(new Response(null, { headers: { ...headers, 'Content-Length': String(size) } }))
    return new Response(body(0, size - 1), { headers: { ...headers, 'Content-Length': String(size) } })
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (start >= size || start > end) return empty(new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } }))
  const partial = { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
  if (request.method === 'HEAD') return empty(new Response(null, { status: 206, headers: partial }))
  return new Response(body(start, end), { status: 206, headers: partial })
}

/** The media of a finished recording as the track refers to it: by its path in the lecture's directory, with its hash. */
function hashed<T extends MediaSegment>(deckDir: string, id: string, segments: T[]): Promise<T[]> {
  return Promise.all(segments.map(async (segment) => {
    const file = mediaFile(deckDir, id, segment.src)
    const sha256 = file && existsSync(file) ? await sha256File(file) : undefined
    return { ...segment, ...sha256 ? { sha256 } : {} }
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

/** The view of the deck a member gets: editors and owners the whole deck, readers its student view. */
function viewOf(member: Member): DeckView {
  return member.roles.some(role => role === 'editor' || role === 'owner') ? 'full' : 'student'
}

/** What a reader is told of a failure: its kind, nothing the lecture says. */
function readerMessage(status: number): string {
  if (status === 409) return `lecture ${SCRIPT_TRACK} is synthesized when an editor opens it (synthesis is paid)`
  if (status === 503) return 'the lecture is not ready yet'
  return 'the lecture cannot be played now'
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
    const media = { ...recording, audio: await hashed(deckDir, id, recording.audio), video: await hashed(deckDir, id, recording.video) }
    const section = isRecord(body) && typeof body.section === 'string' ? body.section : undefined
    const stored = readTrack(deckDir, id)
    let track: LectureTrack
    if (section && stored) {
      const spliced = spliceSection(stored.track, section, media, head)
      track = spliced.track
      // The media of the section's earlier recording, by its path in the lecture's directory.
      for (const src of spliced.unused) {
        const file = mediaFile(deckDir, id, src)
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
    // A chunk of a recording, and its track at the end (long lectures have many events).
    maxBody: MAX_CHUNK,
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
  /** The lecture renderer's view of the latest IR (of the view), which the lecture is planned from as a build plans it. */
  const compiled = (view: DeckView): IRDocument => {
    const doc = latestView(deckDir, view)
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
  /** Each view's synthesized lecture of the latest IR, made once per IR (a lookup-made one serves lookups only), and the last one made. */
  const synthesized = new Map<DeckView, { doc: IRDocument, made: Promise<LectureTrack>, lookup: boolean }>()
  const last = new Map<DeckView, LectureTrack>()
  const made = (view: DeckView, doc: IRDocument, lookup: boolean): Promise<LectureTrack> => {
    // The student view of a deck that leaves nothing out is the whole deck: one lecture serves both.
    const known = [synthesized.get(view), ...synthesized.values()].find(entry => entry?.doc === doc && (!entry.lookup || lookup))
    if (known) {
      synthesized.set(view, known)
      void known.made.then(track => last.set(view, track), () => {})
      return known.made
    }
    const making = synthesize(doc, lookup)
    synthesized.set(view, { doc, made: making, lookup })
    making.then((track) => {
      last.set(view, track)
    }, () => {
      if (synthesized.get(view)?.made === making) synthesized.delete(view)
    })
    return making
  }
  const scriptTrack = async (view: DeckView): Promise<LectureTrack> => {
    const doc = compiled(view)
    if (view === 'full') {
      const track = await made('full', doc, false)
      // The students' lecture, said with the same clips (the cache has them now), so readers get it without spending.
      void made('student', compiled('student'), false).catch(() => {})
      return track
    }
    // A reader's request spends nothing: the cache alone when no engine can synthesize the voice (each clip a lookup).
    const entry = synthesized.get('student')
    if (entry?.doc === doc) return entry.made
    if (!(await synthesisEngineOf(speech(), doc, voiced()?.engine))) {
      try {
        return await made('student', doc, true)
      } catch (error) {
        if (!last.has('student')) throw error
      }
    }
    const kept = last.get('student')
    if (kept) return kept
    throw new Refusal(409, readerMessage(409))
  }
  /** The voice the deck names, so `script` is its synthesized lecture. */
  const voiced = () => {
    const doc = latestDoc(deckDir)
    return doc ? lectureVoice(lectureConfig(doc)) : undefined
  }
  /** A recorded lecture as a view of the deck has it; undefined when there is none, or nothing of it is left. */
  const recorded = (id: string, view: DeckView): LectureTrack | undefined => {
    const found = trackDir(deckDir, id) ? readTrack(deckDir, id)?.track : undefined
    if (!found || view === 'full') return found
    const [whole, student] = [latestDoc(deckDir), latestDoc(deckDir, 'student')]
    return whole && student ? viewTrack(found, whole, student) : undefined
  }
  /** The lecture a view gets: `script` as made last (none before), or a recorded one. */
  const offered = (id: string, view: DeckView): LectureTrack | undefined => (id === SCRIPT_TRACK && voiced() ? last.get(view) : recorded(id, view))
  /** A track as it is served: media this machine lacks under the external URL of the `url` policy (docs/ir.md 9.1). */
  const served = (track: LectureTrack): LectureTrack => {
    const local = (segment: MediaSegment) => {
      const file = mediaFile(deckDir, track.id, segment.src)
      return Boolean(file && existsSync(file))
    }
    const audio = publishedMedia(track.audio, track.id, policy, local)
    const video = publishedMedia(track.video, track.id, policy, local)
    return { ...track, ...audio ? { audio } : {}, ...video ? { video } : {} }
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

  /** A file of a lecture a member asks for: a clip of the synthesis cache, or a media file of its directory; readers only those of the lecture they get. */
  const lectureFile = (id: string, path: string[], view: DeckView, request: Request): Response => {
    const offer = view === 'full' ? undefined : offered(id, view)
    if (path[0] === CLIPS_DIR && path.length === 2) {
      const clip = decoded(path.slice(1))
      if (view !== 'full' && !offer?.utterances.some(u => u.clip === clip)) return problem(404, 'no such clip')
      return serveFile(deckDir, clipFile(deckDir, clip), request)
    }
    const media = decoded(path)
    if (view !== 'full' && ![...offer?.audio ?? [], ...offer?.video ?? []].some(segment => segment.src === media)) return problem(404, 'no such file')
    return serveFile(deckDir, mediaFile(deckDir, id, media), request)
  }

  return {
    routes: {
      'tracks': {
        role: 'reader',
        handle(_request, { member }) {
          const view = viewOf(member)
          const doc = latestDoc(deckDir, view)
          const voice = voiced()
          const synthetic = voice && doc ? [{ id: SCRIPT_TRACK, lang: doc.meta.lang ?? 'zh-CN', voice: { kind: 'synthetic', ...voice } }] : []
          return json([...synthetic, ...trackIds(deckDir).filter(id => !(voice && id === SCRIPT_TRACK)).flatMap((id) => {
            try {
              const track = recorded(id, view)
              return track ? [{ id, lang: track.lang, voice: track.voice, duration: trackDuration(track), utterances: track.utterances.length }] : []
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
          const view = viewOf(member)
          try {
            if (path.length > 0) return lectureFile(id, path, view, request)
            if (id === SCRIPT_TRACK && voiced()) return json(await scriptTrack(view))
            const track = recorded(id, view)
            return track ? json(served(track)) : problem(404, `no lecture ${id}`)
          } catch (error) {
            const status = error instanceof Refusal ? error.status : 500
            if (view !== 'full') return problem(status, readerMessage(status))
            return problem(status, errorMessage(error))
          }
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
