import { existsSync, statSync } from 'node:fs'
import { errorMessage, isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route } from '@lincyaw/kernel'
import { fileStem, recordedTrack, spliceSection, trackDuration } from '../../domain/index.ts'
import type { LectureTrack, MediaSegment, Recording, TrackHead } from '../../domain/index.ts'
import { freeMediaPath, mediaFile, newTrackId, readTrack, sha256File, trackDir, writeGitFiles, writeTrack } from '../store.ts'
import { decodedPath } from './served-deck.ts'
import type { ServedDeck } from './served-deck.ts'

const MAX_CHUNK = 64 * 1024 * 1024
const MAX_FILE = 4 * 1024 * 1024 * 1024

function withHashes<T extends MediaSegment>(deckDir: string, id: string, segments: T[]): Promise<T[]> {
  return Promise.all(segments.map(async (segment) => {
    const file = mediaFile(deckDir, id, segment.src)
    const sha256 = file && await sha256File(deckDir, file)
    return { ...segment, ...sha256 ? { sha256 } : {} }
  }))
}

function toRecording(value: unknown): Recording | undefined {
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

function toTrackHead(value: unknown, id: string): TrackHead | undefined {
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

export function recordingRoutes(served: ServedDeck): Record<string, Route> {
  const { ctx, deckDir, files, policy } = served

  const finish = async (id: string, request: Request): Promise<Response> => {
    const body: unknown = await request.json().catch(() => undefined)
    const recording = isRecord(body) ? toRecording(body.recording) : undefined
    const head = isRecord(body) ? toTrackHead(body.head, id) : undefined
    if (!recording || !head) return problemResponse(400, 'expected { head, recording }')
    const media = { ...recording, audio: await withHashes(deckDir, id, recording.audio), video: await withHashes(deckDir, id, recording.video) }
    const section = isRecord(body) && typeof body.section === 'string' ? body.section : undefined
    const stored = readTrack(deckDir, id)
    let track: LectureTrack
    if (section && stored) {
      const spliced = spliceSection(stored.track, section, media, head)
      track = spliced.track
      for (const src of spliced.unused) {
        const file = mediaFile(deckDir, id, src)
        if (file) await files.remove(file)
      }
    } else {
      track = recordedTrack(head, media)
    }
    await writeTrack(files, deckDir, track)
    ctx.log.info(`lecture ${id}: ${track.events.length} events, ${(trackDuration(track) / 1000).toFixed(1)} s`)
    return jsonResponse({ id, track })
  }

  return {
    'recordings': {
      async handle(request) {
        if (request.method !== 'POST') return problemResponse(405, 'POST to start a recording')
        const body: unknown = await request.json().catch(() => ({}))
        const existing = isRecord(body) && typeof body.track === 'string' ? body.track : undefined
        if (existing && !readTrack(deckDir, existing)) return problemResponse(404, `no lecture ${existing}`)
        const id = existing ?? newTrackId(deckDir)
        await writeGitFiles(files, trackDir(deckDir, id)!, policy)
        return jsonResponse({ id })
      },
    },
    'recordings/*': {
      maxBody: MAX_CHUNK,
      async handle(request, { rest }) {
        const [id = '', action, ...path] = rest.split('/')
        const dir = trackDir(deckDir, id)
        if (!dir) return problemResponse(404, 'no such lecture')
        try {
          if (action === 'media' && request.method === 'POST') {
            const body: unknown = await request.json().catch(() => undefined)
            if (!isRecord(body) || (body.folder !== 'audio' && body.folder !== 'video') || typeof body.section !== 'string' || typeof body.ext !== 'string' || !/^(ogg|webm|mp4|m4a)$/.test(body.ext)) {
              return problemResponse(400, 'expected { folder, section, ext }')
            }
            const stem = typeof body.kind === 'string' ? `${fileStem(body.section)}.${fileStem(body.kind)}` : fileStem(body.section)
            return jsonResponse({ src: freeMediaPath(deckDir, id, body.folder, stem, body.ext) })
          }
          if (action === 'files' && request.method === 'PUT') {
            const file = mediaFile(deckDir, id, decodedPath(path))
            const at = Number(new URL(request.url).searchParams.get('at') ?? '0')
            if (!file || !Number.isSafeInteger(at) || at < 0) return problemResponse(400, 'expected a media file of the lecture and ?at=<position>')
            const size = existsSync(file) ? statSync(file).size : 0
            if (at > size) return problemResponse(400, `?at=${at} is past the end of the file (${size} bytes)`)
            const bytes = new Uint8Array(await request.arrayBuffer())
            if (bytes.byteLength > MAX_CHUNK || at + bytes.byteLength > MAX_FILE) return problemResponse(413, 'chunk too large')
            await files.write(file, bytes, at)
            return jsonResponse({ written: bytes.byteLength })
          }
          if (action === 'finish' && request.method === 'POST') return await finish(id, request)
        } catch (error) {
          ctx.log.error(`lecture ${id}: ${errorMessage(error)}`)
          return problemResponse(500, errorMessage(error))
        }
        return problemResponse(404, 'unknown recording action')
      },
    },
  }
}
