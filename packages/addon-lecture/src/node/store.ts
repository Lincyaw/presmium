import { createHash } from 'node:crypto'
import { closeSync, constants, createReadStream, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { DocumentFiles } from '@lincyaw/kernel'
import { formatTrack, LECTURES_DIR, parseTrack, TRACK_ID } from '../domain/index.ts'
import type { LectureTrack, MediaSegment } from '../domain/index.ts'

export interface DeckFiles {
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

const MEDIA_PATH = /^(audio|video)\/[^/\\]+\.(ogg|opus|webm|mp4|m4a|wav)$/

export function lecturesDir(deckDir: string): string {
  return join(deckDir, LECTURES_DIR)
}

export function trackDir(deckDir: string, id: string): string | undefined {
  return TRACK_ID.test(id) ? join(lecturesDir(deckDir), id) : undefined
}

export function mediaFile(deckDir: string, id: string, path: string): string | undefined {
  const dir = trackDir(deckDir, id)
  if (!dir || !MEDIA_PATH.test(path) || path.split('/').some(part => part === '..' || part.startsWith('.'))) return undefined
  const file = join(dir, path)
  return relative(dir, file).split(sep)[0] === path.split('/')[0] ? file : undefined
}

export interface StoredTrack {
  track: LectureTrack
  text: string
  file: string
  problems: string[]
}

const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

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
  }
  closeSync(fd)
  return undefined
}

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

export function newTrackId(deckDir: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  const taken = new Set(existsSync(lecturesDir(deckDir)) ? readdirSync(lecturesDir(deckDir)) : [])
  if (!taken.has(day)) return day
  let n = 2
  while (taken.has(`${day}-${n}`)) n++
  return `${day}-${n}`
}

export function freeMediaPath(deckDir: string, id: string, folder: 'audio' | 'video', stem: string, ext: string): string {
  const dir = trackDir(deckDir, id)!
  let path = `${folder}/${stem}.${ext}`
  for (let n = 2; existsSync(join(dir, path)); n++) path = `${folder}/${stem}-${n}.${ext}`
  return path
}

export async function sha256File(deckDir: string, file: string): Promise<string | undefined> {
  const fd = openInDeck(deckDir, file)
  if (fd === undefined) return undefined
  const hash = createHash('sha256')
  for await (const chunk of createReadStream('', { fd })) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

export type MediaPolicy = { kind: 'ignore' } | { kind: 'lfs' } | { kind: 'url', prefix: string }

export function mediaPolicy(settings: Record<string, unknown>): MediaPolicy {
  const audio = settings.audio
  if (audio === 'lfs') return { kind: 'lfs' }
  if (typeof audio === 'string' && /^https?:\/\//.test(audio)) return { kind: 'url', prefix: audio.endsWith('/') ? audio : `${audio}/` }
  return { kind: 'ignore' }
}

export function publishedMedia<T extends MediaSegment>(segments: T[] | undefined, id: string, policy: MediaPolicy, local: (segment: T) => boolean = () => false): T[] | undefined {
  if (!segments || policy.kind !== 'url') return segments
  return segments.map(segment => (/^[a-z][a-z\d+.-]*:/i.test(segment.src) || local(segment) ? segment : { ...segment, src: `${policy.prefix}${id}/${segment.src}` }))
}

export async function writeGitFiles(files: DeckFiles, dir: string, policy: MediaPolicy): Promise<void> {
  if (policy.kind === 'lfs') {
    await files.write(join(dir, '.gitattributes'), 'audio/** filter=lfs diff=lfs merge=lfs -text\nvideo/** filter=lfs diff=lfs merge=lfs -text\n')
    await files.remove(join(dir, '.gitignore'))
    return
  }
  const why = policy.kind === 'url' ? `published under ${policy.prefix}` : 'kept on this machine'
  await files.write(join(dir, '.gitignore'), `# Recorded audio and video are ${why} (settings.presmium.lecture.audio).\naudio/\nvideo/\n`)
}
