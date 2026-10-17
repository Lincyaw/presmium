/**
 * The recorded lectures of a deck on disk (docs/ir.md 9.1): each in
 * `lectures/<id>/` with its `track.json` (committed) and its audio and video
 * (`audio/`, `video/`), which by the operator's `settings.presmium.lecture.audio`
 * stay out of git (`ignore`, the default), go to git LFS (`lfs`), or are
 * published under an external URL (a prefix), still ignored here. The track
 * names its media by their paths in its directory; the prefix applies where
 * the lecture is published (`publishedMedia`).
 */
import { createHash } from 'node:crypto'
import { closeSync, constants, createReadStream, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { DocumentFiles } from '@presmium/kernel'
import { formatTrack, LECTURES_DIR, parseTrack, TRACK_ID } from '../domain/index.ts'
import type { LectureTrack, MediaSegment } from '../domain/index.ts'

/**
 * How the plugin writes files of its deck (absolute paths in it): through
 * the workspace's `DOCUMENT_FILES` when the host has one (`presmium serve`,
 * WP-91), else in this process (`presmium dev`, `build`).
 */
export interface DeckFiles {
  /** Writes the file; with `at`, the bytes at that position of it (no gap). */
  write(file: string, content: string | Uint8Array, at?: number): Promise<void>
  remove(file: string): Promise<void>
}

export function deckFiles(workspaceRoot: string, documentFiles: () => DocumentFiles | undefined): DeckFiles {
  const path = (file: string) => relative(workspaceRoot, file).split(sep).join('/')
  const bytes = (content: string | Uint8Array) => (typeof content === 'string' ? Buffer.from(content) : content)
  return {
    async write(file, content, at) {
      const files = documentFiles()
      if (files) return files.write([{ path: path(file), content: bytes(content), ...at !== undefined ? { at } : {} }])
      mkdirSync(dirname(file), { recursive: true })
      if (at === undefined) return writeFileSync(file, content)
      const handle = await open(file, existsSync(file) ? 'r+' : 'w+')
      try {
        const data = bytes(content)
        await handle.write(data, 0, data.byteLength, at)
      } finally {
        await handle.close()
      }
    },
    async remove(file) {
      const files = documentFiles()
      if (files) return files.write([{ path: path(file), remove: true }])
      rmSync(file, { force: true })
    },
  }
}

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

/** How a file is opened to be read: not through a link at its name, nor waiting for a writer of a FIFO (`O_NONBLOCK`, as the compiler's reads). */
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

/** The bytes of a regular file, opened as `OPEN_FLAGS` says; undefined for any other (a link, a FIFO, a directory) or none. */
export function readRegular(file: string): Buffer | undefined {
  let fd: number
  try {
    fd = openSync(file, OPEN_FLAGS)
  } catch {
    return undefined
  }
  try {
    return fstatSync(fd).isFile() ? readFileSync(fd) : undefined
  } catch {
    return undefined
  } finally {
    closeSync(fd)
  }
}

/** The path a descriptor has open: by `/proc/self/fd` (Linux); elsewhere `expected` when its real path is it and it is the same file. */
function openedPath(fd: number, expected: string): string | undefined {
  try {
    return readlinkSync(`/proc/self/fd/${fd}`)
  } catch {
    try {
      const opened = fstatSync(fd)
      const now = statSync(expected)
      return realpathSync(expected) === expected && now.dev === opened.dev && now.ino === opened.ino ? expected : undefined
    } catch {
      return undefined
    }
  }
}

/**
 * Opens a file of the deck to read when it is a regular file at that very
 * place, outside `.git`, with no link on the way from the deck directory: a
 * link, or one swapped in between a check and the read, could lead to the
 * git directory, the workspace's settings or another document (WP-91b), and
 * a FIFO would keep the open waiting, and serve with it. The file checked is the one opened, by its descriptor. Undefined when
 * it cannot be read so; the caller closes the descriptor.
 */
export function openInDeck(deckDir: string, file: string): number | undefined {
  let expected: string
  try {
    const rel = relative(deckDir, file)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || rel.split(sep).includes('.git')) return undefined
    expected = join(realpathSync(deckDir), rel)
  } catch {
    return undefined
  }
  let fd: number
  try {
    fd = openSync(file, OPEN_FLAGS)
  } catch {
    return undefined
  }
  try {
    if (fstatSync(fd).isFile() && openedPath(fd, expected) === expected) return fd
  } catch {
    // Not read.
  }
  closeSync(fd)
  return undefined
}

/** The bytes of a file of the deck, as `openInDeck` opens it; undefined when it cannot be read so. */
export function readInDeck(deckDir: string, file: string): Buffer | undefined {
  const fd = openInDeck(deckDir, file)
  if (fd === undefined) return undefined
  try {
    return readFileSync(fd)
  } catch {
    return undefined
  } finally {
    closeSync(fd)
  }
}

/** Track `id` as stored; undefined when there is none. Throws on a file that is no track. */
export function readTrack(deckDir: string, id: string): StoredTrack | undefined {
  const dir = trackDir(deckDir, id)
  const file = dir && join(dir, TRACK_FILE)
  const bytes = file ? readInDeck(deckDir, file) : undefined
  if (!file || !bytes) return undefined
  const text = bytes.toString('utf8')
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

export async function writeTrack(files: DeckFiles, deckDir: string, track: LectureTrack): Promise<string> {
  const dir = trackDir(deckDir, track.id)
  if (!dir) throw new Error(`invalid lecture id ${track.id}`)
  const file = join(dir, TRACK_FILE)
  await files.write(file, formatTrack(track))
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

/** The sha256 of a file of the deck, read as a stream from the file `openInDeck` opens (recordings can be large); undefined when it cannot be read so. */
export async function sha256File(deckDir: string, file: string): Promise<string | undefined> {
  const fd = openInDeck(deckDir, file)
  if (fd === undefined) return undefined
  const hash = createHash('sha256')
  for await (const chunk of createReadStream('', { fd })) hash.update(chunk as Buffer)
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

/**
 * The media of a track as a published lecture names them: under the external
 * URL of the `url` policy, `<prefix><id>/<path>`, where the operator puts the
 * files; those `local` says are here (the files of this machine) keep their
 * paths. The track itself keeps the paths (docs/ir.md 9.1).
 */
export function publishedMedia<T extends MediaSegment>(segments: T[] | undefined, id: string, policy: MediaPolicy, local: (segment: T) => boolean = () => false): T[] | undefined {
  if (!segments || policy.kind !== 'url') return segments
  return segments.map(segment => (/^[a-z][a-z\d+.-]*:/i.test(segment.src) || local(segment) ? segment : { ...segment, src: `${policy.prefix}${id}/${segment.src}` }))
}

/** The git files of a track's directory that keep its media out of git, or hand it to LFS. */
export async function writeGitFiles(files: DeckFiles, dir: string, policy: MediaPolicy): Promise<void> {
  if (policy.kind === 'lfs') {
    await files.write(join(dir, '.gitattributes'), 'audio/** filter=lfs diff=lfs merge=lfs -text\nvideo/** filter=lfs diff=lfs merge=lfs -text\n')
    await files.remove(join(dir, '.gitignore'))
    return
  }
  const why = policy.kind === 'url' ? `published under ${policy.prefix}` : 'kept on this machine'
  await files.write(join(dir, '.gitignore'), `# Recorded audio and video are ${why} (settings.presmium.lecture.audio).\naudio/\nvideo/\n`)
}
