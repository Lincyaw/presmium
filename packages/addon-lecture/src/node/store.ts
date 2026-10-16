/**
 * The recorded lectures of a deck on disk (docs/ir.md 9.1): each in
 * `lectures/<id>/` with its `track.json` (committed) and its audio and video
 * (`audio/`, `video/`), which by the operator's `settings.presmium.lecture.audio`
 * stay out of git (`ignore`, the default), go to git LFS (`lfs`), or are
 * published under an external URL (a prefix), still ignored here.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { formatTrack, LECTURES_DIR, parseTrack, TRACK_ID } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'

export const TRACK_FILE = 'track.json'

/** A media file of a track: `audio/` or `video/`, one level, a known extension. */
const MEDIA_PATH = /^(audio|video)\/[^/\\]+\.(ogg|opus|webm|mp4|m4a|wav)$/

export function lecturesDir(deckDir: string): string {
  return join(deckDir, LECTURES_DIR)
}

/** The directory of track `id`; undefined for an id that is no plain directory name. */
export function trackDir(deckDir: string, id: string): string | undefined {
  return TRACK_ID.test(id) ? join(lecturesDir(deckDir), id) : undefined
}

/** A media file of a track, inside its directory; undefined for any other path. */
export function mediaFile(deckDir: string, id: string, path: string): string | undefined {
  const dir = trackDir(deckDir, id)
  if (!dir || !MEDIA_PATH.test(path) || path.split('/').some(part => part === '..' || part.startsWith('.'))) return undefined
  const file = join(dir, path)
  return relative(dir, file).split(sep)[0] === path.split('/')[0] ? file : undefined
}

export interface StoredTrack {
  track: LectureTrack
  /** The file as written, for the line of an event. */
  text: string
  file: string
  problems: string[]
}

/** Track `id` as stored; undefined when there is none. Throws on a file that is no track. */
export function readTrack(deckDir: string, id: string): StoredTrack | undefined {
  const dir = trackDir(deckDir, id)
  const file = dir && join(dir, TRACK_FILE)
  if (!file || !existsSync(file)) return undefined
  const text = readFileSync(file, 'utf8')
  const { track, problems } = parseTrack(JSON.parse(text))
  if (!track) throw new Error(`${relative(deckDir, file)}: ${problems.join('; ')}`)
  return { track, text, file, problems }
}

/** The ids of the deck's recorded lectures (directories with a track), sorted. */
export function trackIds(deckDir: string): string[] {
  const dir = lecturesDir(deckDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && TRACK_ID.test(entry.name) && existsSync(join(dir, entry.name, TRACK_FILE)))
    .map(entry => entry.name)
    .sort()
}

export function writeTrack(deckDir: string, track: LectureTrack): string {
  const dir = trackDir(deckDir, track.id)
  if (!dir) throw new Error(`invalid lecture id ${track.id}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, TRACK_FILE)
  writeFileSync(file, formatTrack(track))
  return file
}

/** A new track id: today's date, numbered when the deck has one of that day already. */
export function newTrackId(deckDir: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  const taken = new Set(existsSync(lecturesDir(deckDir)) ? readdirSync(lecturesDir(deckDir)) : [])
  if (!taken.has(day)) return day
  let n = 2
  while (taken.has(`${day}-${n}`)) n++
  return `${day}-${n}`
}

/** A media file name not taken in the track's directory: `<folder>/<stem>.<ext>`, numbered when needed. */
export function freeMediaPath(deckDir: string, id: string, folder: 'audio' | 'video', stem: string, ext: string): string {
  const dir = trackDir(deckDir, id)!
  let path = `${folder}/${stem}.${ext}`
  for (let n = 2; existsSync(join(dir, path)); n++) path = `${folder}/${stem}-${n}.${ext}`
  return path
}

/** Writes `bytes` at `position` of a media file, creating it (and its folder) when needed. */
export async function writeAt(file: string, position: number, bytes: Uint8Array): Promise<void> {
  mkdirSync(join(file, '..'), { recursive: true })
  const handle = await open(file, existsSync(file) ? 'r+' : 'w+')
  try {
    await handle.write(bytes, 0, bytes.byteLength, position)
  } finally {
    await handle.close()
  }
}

/** The sha256 of a file, read as a stream (recordings can be large). */
export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Where recorded media goes (`settings.presmium.lecture.audio`). */
export type MediaPolicy = { kind: 'ignore' } | { kind: 'lfs' } | { kind: 'url', prefix: string }

export function mediaPolicy(settings: Record<string, unknown>): MediaPolicy {
  const audio = settings.audio
  if (audio === 'lfs') return { kind: 'lfs' }
  if (typeof audio === 'string' && /^https?:\/\//.test(audio)) return { kind: 'url', prefix: audio.endsWith('/') ? audio : `${audio}/` }
  return { kind: 'ignore' }
}

/** The git files of a track's directory that keep its media out of git, or hand it to LFS. */
export function writeGitFiles(dir: string, policy: MediaPolicy): void {
  mkdirSync(dir, { recursive: true })
  if (policy.kind === 'lfs') {
    writeFileSync(join(dir, '.gitattributes'), 'audio/** filter=lfs diff=lfs merge=lfs -text\nvideo/** filter=lfs diff=lfs merge=lfs -text\n')
    rmSync(join(dir, '.gitignore'), { force: true })
    return
  }
  const why = policy.kind === 'url' ? `published under ${policy.prefix}` : 'kept on this machine'
  writeFileSync(join(dir, '.gitignore'), `# Recorded audio and video are ${why} (settings.presmium.lecture.audio).\naudio/\nvideo/\n`)
}
