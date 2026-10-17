/**
 * The lecture plugin's routes under `/__presmium/presmium.lecture/`
 * (docs/architecture.md 4.7): the recorded lectures listed and played, and
 * recorded. A recording uploads its media as it goes, a chunk every
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
 * The lectures are those of the whole deck: `script` said from the plan of
 * the latest IR, taken anew on each request from the synthesis cache (the
 * engine synthesizes only what the cache lacks), so the speech service
 * checks a cloned voice's consent each time. A clip is given by its key, as
 * the speech service gives it from the cache now (`cachedClip`): never
 * synthesized, and refused once a cloned voice's consent is withdrawn (D-7,
 * F-57); a clip of `script` is one of the last few different lectures taken
 * (each kept once: a page that loaded one before the IR changed still plays
 * it, however often other windows take the latest), a clip of a recorded
 * lecture one its utterances say (said again in a synthetic voice). Files
 * are read as they are opened, never through a link nor waiting on a FIFO
 * (`openInDeck`).
 *
 * The author also works on a recorded lecture's words (WP-83), each change
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
import type { IRDocument, Route, ServerContext, ServerContribution, SpeechService } from '@presmium/kernel'
import { CLIPS_DIR, editUtterance, fileStem, lectureVoice, lexiconOf, recordedTrack, resynthesizedTrack, SCRIPT_TRACK, spliceSection, trackDuration } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, Recording, TrackHead, Voice } from '../domain/index.ts'
import { cachedClip, clipFile, synthesisEngineOf, synthesizedLecture, transcribeLecture, transcriptionEngine, unsaidMessage } from './lecture.ts'
import { latestDoc, latestView, lectureConfig } from './plan.ts'
import type { MadeClip } from './speak.ts'
import { clipVoice, synthesizeClip } from './speak.ts'
import { deckFiles, freeMediaPath, mediaFile, mediaPolicy, newTrackId, openInDeck, publishedMedia, readTrack, sha256File, trackDir, trackIds, writeGitFiles, writeTrack } from './store.ts'

/** How many different synthesized lectures keep their clips given (a page plays the one it loaded). */
const TAKES = 8

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
    const sha256 = file && await sha256File(deckDir, file)
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

export function lectureServer(ctx: ServerContext): ServerContribution {
  const { deckDir } = ctx
  const policy = mediaPolicy(ctx.settings)
  // Written through the workspace's writer in `presmium serve` (WP-91).
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
  /** The lecture renderer's view of the latest IR, which the lecture is planned from as a build plans it. */
  const compiled = (): IRDocument => {
    const doc = latestView(deckDir)
    if (!doc) throw new Refusal(503, 'the deck has not compiled yet')
    return doc
  }
  const lexicon = lexiconOf(ctx.config)

  /**
   * The clips of the synthesized lectures taken lately, by name, one set a
   * lecture: kept once however often a lecture is taken (by its clips: an IR
   * taken again, or another that says the same), the last taken at the end,
   * the `TAKES` latest kept. A page that loaded a lecture plays it while
   * other windows take the latest many times.
   */
  const takes = new Map<string, Set<string>>()
  /** A take of the lecture in flight, which the requests of the same IR share. */
  let taking: { doc: IRDocument, made: Promise<LectureTrack> } | undefined
  /**
   * The deck's synthesized lecture of the latest IR, taken anew on each
   * request: the clips the cache has are not synthesized again, and the
   * speech service checks each cloned voice's consent on a hit (D-7).
   */
  const scriptTrack = (): Promise<LectureTrack> => {
    const doc = compiled()
    if (taking?.doc === doc) return taking.made
    const made = synthesizedLecture(doc, deckDir, speech(), undefined, { files }).then(({ deck, track, unsaid, clips }) => {
      if (!deck.voice) throw new Refusal(404, `no lecture ${SCRIPT_TRACK}: renderers.lecture.voice names no voice`)
      if (!track) throw new Refusal(502, unsaid.map(unsaidMessage).join('\n'))
      const names = [...new Set([...clips.values()].map(clip => clip.file))].sort()
      const key = names.join('\n')
      takes.delete(key)
      takes.set(key, new Set(names))
      if (takes.size > TAKES) takes.delete(takes.keys().next().value!)
      return track
    })
    taking = { doc, made }
    const done = () => {
      if (taking?.made === made) taking = undefined
    }
    made.then(done, done)
    return made
  }
  /**
   * Why a clip of a lecture may not be given, if it may not: `script`'s must be one of a lecture taken
   * lately, a recorded lecture's one its utterances say; then the speech service gives it by its key from
   * the cache (no synthesis: a clip the cache lost is 404), refusing a cloned voice whose consent was
   * withdrawn (D-7).
   */
  const clipRefusal = async (id: string, name: string): Promise<Response | undefined> => {
    const said = id === SCRIPT_TRACK && voiced() ? [...takes.values()].some(take => take.has(name)) : recorded(id)?.utterances.some(u => u.clip === name)
    if (!said) return problem(404, `no clip ${name} in the lecture ${id}`)
    try {
      return (await cachedClip(speech(), name)) ? undefined : problem(404, `the clip ${name} is not in the synthesis cache`)
    } catch (error) {
      if (error instanceof Refusal) return problem(error.status, error.message)
      return problem(403, `the clip ${name} may not be given: ${errorMessage(error)}`)
    }
  }
  /** The voice the deck names, so `script` is its synthesized lecture. */
  const voiced = () => {
    const doc = latestDoc(deckDir)
    return doc ? lectureVoice(lectureConfig(doc)) : undefined
  }
  /** A recorded lecture; undefined when there is none. */
  const recorded = (id: string): LectureTrack | undefined => (trackDir(deckDir, id) ? readTrack(deckDir, id)?.track : undefined)
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

  /** A file of a lecture: a clip of the synthesis cache it says (its voice allowed now, D-7), or a media file of its directory. */
  const lectureFile = async (id: string, path: string[], request: Request): Promise<Response> => {
    if (path[0] === CLIPS_DIR && path.length === 2) {
      const name = decoded(path.slice(1))
      return await clipRefusal(id, name) ?? serveFile(deckDir, clipFile(deckDir, name), request)
    }
    return serveFile(deckDir, mediaFile(deckDir, id, decoded(path)), request)
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
              const track = recorded(id)
              return track ? [{ id, lang: track.lang, voice: track.voice, duration: trackDuration(track), utterances: track.utterances.length }] : []
            } catch {
              return []
            }
          })])
        },
      },
      'tracks/*': {
        role: 'reader',
        async handle(request, { rest }) {
          const [id = '', ...path] = rest.split('/')
          try {
            if (path.length > 0) return await lectureFile(id, path, request)
            if (id === SCRIPT_TRACK && voiced()) return json(await scriptTrack())
            const track = recorded(id)
            return track ? json(served(track)) : problem(404, `no lecture ${id}`)
          } catch (error) {
            return problem(error instanceof Refusal ? error.status : 500, errorMessage(error))
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
