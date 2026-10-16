/**
 * The lecture plugin's routes under `/__presmium/presmium.lecture/`
 * (docs/architecture.md 4.7): readers list and play the recorded lectures;
 * editors record. A recording uploads its media as it goes, a chunk every
 * few seconds, each written at its byte position (the WebM muxer writes its
 * header last), then sends the track.
 *
 *   GET  tracks                                the lectures: id, length, voice, language
 *   GET  tracks/<id>                           track.json
 *   GET  tracks/<id>/<audio|video>/<file>      a media file, with ranges (seeking)
 *   POST recordings          { track? }        a new lecture, or one to record a section of again: { id }
 *   POST recordings/<id>/media  { folder, section, kind?, ext }   a free file name: { src }
 *   PUT  recordings/<id>/files/<src>?at=<n>    bytes written at position n
 *   POST recordings/<id>/finish  { head, recording, section? }    writes track.json: { id, track }
 */
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { Route, ServerContext, ServerContribution } from '@presmium/kernel'
import { fileStem, recordedTrack, spliceSection, trackDuration } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, Recording, TrackHead } from '../domain/index.ts'
import { freeMediaPath, mediaFile, mediaPolicy, newTrackId, readTrack, sha256File, trackDir, trackIds, writeAt, writeGitFiles, writeTrack } from './store.ts'
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
    voice: isRecord(value.voice) && value.voice.kind === 'recorded'
      ? { kind: 'recorded', ...typeof value.voice.speaker === 'string' ? { speaker: value.voice.speaker } : {} }
      : { kind: 'recorded' },
    blocks: isRecord(value.blocks) ? value.blocks as TrackHead['blocks'] : {},
  }
}

export function lectureServer(ctx: ServerContext): ServerContribution {
  const { deckDir } = ctx
  const policy = mediaPolicy(ctx.settings)

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
        if (file) rmSync(file, { force: true })
      }
    } else {
      track = recordedTrack(head, media)
    }
    writeTrack(deckDir, track)
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
          await writeAt(file, at, bytes)
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

  return {
    routes: {
      'tracks': {
        role: 'reader',
        handle: () => json(trackIds(deckDir).flatMap((id) => {
          try {
            const { track } = readTrack(deckDir, id)!
            return [{ id, lang: track.lang, voice: track.voice, duration: trackDuration(track) }]
          } catch {
            return []
          }
        })),
      },
      'tracks/*': {
        role: 'reader',
        handle(request, { rest }) {
          const [id = '', ...path] = rest.split('/')
          if (path.length === 0) {
            try {
              const stored = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
              return stored ? json(stored.track) : problem(404, `no lecture ${id}`)
            } catch (error) {
              return problem(500, errorMessage(error))
            }
          }
          const file = mediaFile(deckDir, id, decoded(path))
          return file && existsSync(file) ? serveFile(file, request) : problem(404, 'no such file')
        },
      },
      'recordings': {
        async handle(request) {
          if (request.method !== 'POST') return problem(405, 'POST to start a recording')
          const body: unknown = await request.json().catch(() => ({}))
          const existing = isRecord(body) && typeof body.track === 'string' ? body.track : undefined
          if (existing && !readTrack(deckDir, existing)) return problem(404, `no lecture ${existing}`)
          const id = existing ?? newTrackId(deckDir)
          writeGitFiles(trackDir(deckDir, id)!, policy)
          return json({ id })
        },
      },
      'recordings/*': recordings,
    },
  }
}
