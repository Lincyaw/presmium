import { createHash, randomBytes } from 'node:crypto'
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { AigcLabel, DocumentFiles, SpeechWord, SynthesisRequest } from '@lincyaw/kernel'
import { isRecord, speechEngineId } from '@lincyaw/kernel'
import type { SynthesisResult } from './backend.ts'

export function cacheKey(request: SynthesisRequest & { engine: string }, spoken: string): string {
  const parts = ['presmium.speech/1', speechEngineId(request.engine), request.voice, request.lang, request.rate ?? 1, request.style ?? '', request.text, spoken]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}

const KEY = /^[0-9a-f]{32}$/

export interface CacheRecord {
  key: string
  audio: string
  mime: string
  duration: number
  words?: SpeechWord[]
  engine: string
  model: string
  voice: string
  provider: string
  cloned: boolean
  lang: string
  text: string
  synthetic: true
  AIGC: AigcLabel
  sha256: string
}

interface LockFile {
  version: 1
  synthesis: Record<string, { audio: string, sha256: string }>
}

const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

function readRegular(file: string): Buffer | undefined {
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

function writeAtomic(file: string, data: string | Uint8Array): void {
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, data, { flag: 'wx' })
  renameSync(temporary, file)
}

export class SynthesisCache {
  readonly dir: string
  readonly lockFile: string

  readonly #deckDir: string
  readonly #workspaceRoot: string
  readonly #files: () => DocumentFiles | undefined

  constructor(deckDir: string, workspaceRoot = deckDir, files: () => DocumentFiles | undefined = () => undefined) {
    this.#deckDir = deckDir
    this.#workspaceRoot = workspaceRoot
    this.#files = files
    this.dir = join(deckDir, '.presmium', 'speech')
    this.lockFile = join(deckDir, '.presmium', 'speech.lock.json')
  }

  async #put(file: string, data: string | Uint8Array): Promise<void> {
    const files = this.#files()
    if (!files) return writeAtomic(file, data)
    await files.write([{ path: relative(this.#workspaceRoot, file).split(sep).join('/'), content: typeof data === 'string' ? Buffer.from(data) : data }])
  }

  #contained(): boolean {
    const deck = realpathSync(this.#deckDir)
    const dir = realpathSync(this.dir)
    return dir === join(deck, '.presmium', 'speech')
  }

  async find(key: string): Promise<{ record: CacheRecord, file: string, audio: Buffer } | undefined> {
    if (!KEY.test(key)) return undefined
    let found: { record: CacheRecord, file: string, audio: Buffer }
    try {
      if (!this.#contained()) return undefined
      const json = readRegular(join(this.dir, `${key}.json`))
      const record = json && JSON.parse(json.toString('utf8')) as CacheRecord
      if (!isRecord(record) || record.key !== key || typeof record.audio !== 'string') return undefined
      if (record.audio !== `${key}.wav` && record.audio !== `${key}.ogg`) return undefined
      const file = join(this.dir, record.audio)
      const audio = readRegular(file)
      if (!audio) return undefined
      found = { record, file, audio }
    } catch {
      return undefined
    }
    await this.#lock(key, found.record).catch(() => undefined)
    return found
  }

  async write(result: SynthesisResult, request: { lang: string, text: string }): Promise<{ record: CacheRecord, file: string }> {
    if (!this.#files()) {
      mkdirSync(this.dir, { recursive: true })
      if (!this.#contained()) throw new Error(`the synthesis cache ${this.dir} resolves outside the deck`)
    }
    const audio = `${result.key}.${result.ext}`
    const file = join(this.dir, audio)
    const record: CacheRecord = {
      key: result.key,
      audio,
      mime: result.mime,
      duration: result.duration,
      ...result.words ? { words: result.words } : {},
      engine: result.engine,
      model: result.model,
      voice: result.voice,
      provider: result.provider,
      cloned: result.cloned,
      lang: request.lang,
      text: request.text,
      synthetic: true,
      AIGC: result.AIGC,
      sha256: createHash('sha256').update(result.audio).digest('hex'),
    }
    await this.#put(file, result.audio)
    await this.#put(join(this.dir, `${result.key}.json`), `${JSON.stringify(record, null, 2)}\n`)
    await this.#lock(result.key, record)
    return { record, file }
  }

  readAlignment(key: string): SpeechWord[] | undefined {
    if (!KEY.test(key)) return undefined
    try {
      if (!this.#contained()) return undefined
      const value: unknown = JSON.parse(readRegular(join(this.dir, `${key}.align.json`))?.toString('utf8') ?? '')
      return isRecord(value) && Array.isArray(value.words) ? value.words as SpeechWord[] : undefined
    } catch {
      return undefined
    }
  }

  async writeAlignment(key: string, words: SpeechWord[]): Promise<void> {
    await this.#put(join(this.dir, `${key}.align.json`), `${JSON.stringify({ key, words }, null, 2)}\n`)
  }

  async pruneLock(keep: ReadonlySet<string>): Promise<number> {
    const lock = this.#readLock()
    if (!lock) return 0
    const kept = Object.keys(lock.synthesis).filter(key => keep.has(key))
    const dropped = Object.keys(lock.synthesis).length - kept.length
    if (dropped > 0) await this.#writeLock(Object.fromEntries(kept.map(key => [key, lock.synthesis[key]!])))
    return dropped
  }

  async #lock(key: string, record: CacheRecord): Promise<void> {
    const lock = this.#readLock() ?? { version: 1, synthesis: {} }
    const known = lock.synthesis[key]
    if (known?.audio === record.audio && known.sha256 === record.sha256) return
    lock.synthesis[key] = { audio: record.audio, sha256: record.sha256 }
    await this.#writeLock(lock.synthesis)
  }

  #readLock(): LockFile | undefined {
    try {
      const read: unknown = JSON.parse(readRegular(this.lockFile)?.toString('utf8') ?? '')
      return isRecord(read) && isRecord(read.synthesis) ? read as unknown as LockFile : undefined
    } catch {
      return undefined
    }
  }

  async #writeLock(synthesis: LockFile['synthesis']): Promise<void> {
    const entries = Object.keys(synthesis).sort().map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(synthesis[k])}`)
    await this.#put(this.lockFile, `{\n  "version": 1,\n  "synthesis": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`)
  }
}
