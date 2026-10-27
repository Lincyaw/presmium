import { createHash, randomBytes } from 'node:crypto'
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { AigcLabel, DocumentFiles, SpeechWord, SynthesisRequest } from '@lincyaw/kernel'
import { isRecord, speechEngineId } from '@lincyaw/kernel'
import { applyLexicon } from '../domain/index.ts'
import type { CacheProfile } from './backend.ts'
import type { SynthesisResult } from './backend.ts'

export function cacheKey(request: SynthesisRequest & { engine: string }, spoken: string): string {
  const parts = ['presmium.speech/1', speechEngineId(request.engine), request.voice, request.lang, request.rate ?? 1, request.style ?? '', request.text, spoken]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
}

export function profileCacheKey(requestKey: string, profile: string): string {
  return createHash('sha256').update(JSON.stringify(['presmium.speech/2', requestKey, profile])).digest('hex').slice(0, 32)
}

const KEY = /^[0-9a-f]{32}$/
const SHA = /^[0-9a-f]{64}$/
const MAX_LOCK_ENTRIES = 16_384
const MAX_LOCK_BYTES = 4_194_304
const LOCK_WRITES = new Map<string, Promise<unknown>>()

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
  /** Opaque, credential-free configuration identity. Absent on legacy locked records. */
  profile?: string
  requestKey?: string
  request?: { spoken: string, rate: number, style: string }
}

interface LockFile {
  version: 1
  synthesis: Record<string, { audio: string, sha256: string, requestKey?: string, profile?: string }>
}

interface LockSnapshot {
  version: string
  lock: Readonly<{ version: 1, synthesis: Readonly<LockFile['synthesis']> }>
  requests: ReadonlyMap<string, string | undefined>
}

function fileVersion(stat: ReturnType<typeof fstatSync> & { mtimeNs?: bigint, ctimeNs?: bigint }): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
}

const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)

function readRegular(file: string, maxBytes = Infinity): Buffer | undefined {
  let fd: number
  try {
    fd = openSync(file, OPEN_FLAGS)
  } catch {
    return undefined
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > maxBytes) return undefined
    const bytes = readFileSync(fd)
    return bytes.length <= maxBytes ? bytes : undefined
  } catch {
    return undefined
  } finally {
    closeSync(fd)
  }
}

function wordsOf(value: unknown): value is SpeechWord[] {
  return Array.isArray(value) && value.every(word => isRecord(word) && typeof word.text === 'string' && Number.isFinite(word.start) && Number.isFinite(word.end) && (word.start as number) >= 0 && (word.end as number) >= (word.start as number))
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
  #lockSnapshot?: LockSnapshot

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
      const json = readRegular(join(this.dir, `${key}.json`), 1_048_576)
      const record = json && JSON.parse(json.toString('utf8')) as CacheRecord
      if (!isRecord(record) || record.key !== key || typeof record.audio !== 'string') return undefined
      if (record.audio !== `${key}.wav` && record.audio !== `${key}.ogg`) return undefined
      if (!['engine', 'model', 'voice', 'provider', 'lang', 'text', 'mime'].every(field => typeof record[field] === 'string') || !Number.isFinite(record.duration) || record.duration <= 0 || !SHA.test(record.sha256) || record.synthetic !== true || !isRecord(record.AIGC) || record.AIGC.ProduceID !== key || record.AIGC.ContentProducer !== record.provider) return undefined
      if (record.words !== undefined && !wordsOf(record.words)) return undefined
      if (record.profile !== undefined || record.requestKey !== undefined || record.request !== undefined) {
        if (!SHA.test(record.profile ?? '') || !KEY.test(record.requestKey ?? '') || !isRecord(record.request) || typeof record.request.spoken !== 'string' || typeof record.request.style !== 'string' || !Number.isFinite(record.request.rate)) return undefined
        if (cacheKey({ engine: record.engine, voice: record.voice, lang: record.lang, text: record.text, rate: record.request.rate, style: record.request.style }, record.request.spoken) !== record.requestKey || profileCacheKey(record.requestKey!, record.profile!) !== key) return undefined
      }
      const file = join(this.dir, record.audio)
      const audio = readRegular(file)
      if (!audio || createHash('sha256').update(audio).digest('hex') !== record.sha256) return undefined
      found = { record, file, audio }
    } catch {
      return undefined
    }
    return found
  }

  /** Offline reuse requires an explicit lock; a read never creates or repairs that lock. */
  locked(record: CacheRecord): boolean {
    const entry = this.#readLock()?.lock.synthesis[record.key]
    return !!entry && entry.audio === record.audio && entry.sha256 === record.sha256 && entry.profile === record.profile && entry.requestKey === record.requestKey
  }

  resolveRequest(requestKey: string): string | undefined {
    if (!KEY.test(requestKey)) return undefined
    return this.#readLock()?.requests.get(requestKey)
  }

  async write(result: SynthesisResult, request: SynthesisRequest): Promise<{ record: CacheRecord, file: string }> {
    const spoken = applyLexicon(request.text, request.lexicon)
    if (!SHA.test(result.profile ?? '') || cacheKey({ ...request, engine: result.engine }, spoken) !== result.requestKey || profileCacheKey(result.requestKey!, result.profile!) !== result.key) throw new Error('synthesis cache identity does not match the generated request')
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
      profile: result.profile,
      requestKey: result.requestKey,
      request: { spoken, rate: request.rate ?? 1, style: request.style ?? '' },
    }
    await this.#put(file, result.audio)
    await this.#put(join(this.dir, `${result.key}.json`), `${JSON.stringify(record, null, 2)}\n`)
    await this.#lock(result.key, record)
    return { record, file }
  }

  readAlignment(record: CacheRecord, lang: string, transcriber: CacheProfile): SpeechWord[] | undefined {
    const key = record.key
    if (!KEY.test(key)) return undefined
    try {
      if (!this.#contained()) return undefined
      const value: unknown = JSON.parse(readRegular(join(this.dir, `${key}.align.json`), 1_048_576)?.toString('utf8') ?? '')
      if (!isRecord(value) || value.key !== key || value.sha256 !== record.sha256 || value.profile !== (record.profile ?? null) || value.lang !== lang || typeof value.transcriber !== 'string' || !SHA.test(value.transcriber) || !wordsOf(value.words)) return undefined
      if (transcriber.status === 'unavailable' || transcriber.status === 'configured' && value.transcriber !== transcriber.profile) return undefined
      return value.words
    } catch {
      return undefined
    }
  }

  async writeAlignment(record: CacheRecord, lang: string, transcriber: string, words: SpeechWord[]): Promise<void> {
    await this.#put(join(this.dir, `${record.key}.align.json`), `${JSON.stringify({ key: record.key, sha256: record.sha256, profile: record.profile ?? null, lang, transcriber, words }, null, 2)}\n`)
  }

  async pruneLock(keep: ReadonlySet<string>): Promise<number> {
    return this.#updateLock(async lock => {
      const kept = Object.keys(lock.synthesis).filter(key => keep.has(key))
      const dropped = Object.keys(lock.synthesis).length - kept.length
      if (dropped > 0) await this.#writeLock(Object.fromEntries(kept.map(key => [key, lock.synthesis[key]!])))
      return dropped
    })
  }

  async #lock(key: string, record: CacheRecord): Promise<void> {
    await this.#updateLock(async lock => {
      const entry = { audio: record.audio, sha256: record.sha256, requestKey: record.requestKey, profile: record.profile }
      if (JSON.stringify(lock.synthesis[key]) === JSON.stringify(entry)) return
      lock.synthesis[key] = entry
      await this.#writeLock(lock.synthesis)
    })
  }

  async #updateLock<T>(update: (lock: LockFile) => Promise<T>): Promise<T> {
    const before = LOCK_WRITES.get(this.lockFile) ?? Promise.resolve()
    const pending = before.catch(() => undefined).then(() => update({ version: 1, synthesis: { ...this.#readLock()?.lock.synthesis } }))
    LOCK_WRITES.set(this.lockFile, pending)
    try { return await pending }
    finally { if (LOCK_WRITES.get(this.lockFile) === pending) LOCK_WRITES.delete(this.lockFile) }
  }

  #readLock(): LockSnapshot | undefined {
    let fd: number | undefined
    try {
      fd = openSync(this.lockFile, OPEN_FLAGS)
      const before = fstatSync(fd, { bigint: true })
      if (!before.isFile() || before.size > BigInt(MAX_LOCK_BYTES)) throw new Error('invalid speech lock size')
      const version = fileVersion(before)
      if (this.#lockSnapshot?.version === version) return this.#lockSnapshot
      // Read at most the observed extent plus one byte, and reject an in-place change while reading.
      const bytes = Buffer.alloc(Number(before.size) + 1)
      let length = 0
      while (length < bytes.length) {
        const count = readSync(fd, bytes, length, bytes.length - length, length)
        if (!count) break
        length += count
      }
      if (length !== Number(before.size) || fileVersion(fstatSync(fd, { bigint: true })) !== version) throw new Error('speech lock changed while reading')
      const read: unknown = JSON.parse(bytes.subarray(0, length).toString('utf8'))
      if (!isRecord(read) || read.version !== 1 || !isRecord(read.synthesis)) throw new Error('invalid speech lock')
      const entries = Object.entries(read.synthesis)
      if (entries.length > MAX_LOCK_ENTRIES || !entries.every(([key, entry]) => KEY.test(key) && isRecord(entry) && (entry.audio === `${key}.ogg` || entry.audio === `${key}.wav`) && typeof entry.sha256 === 'string' && SHA.test(entry.sha256) && (entry.profile === undefined && entry.requestKey === undefined || typeof entry.profile === 'string' && SHA.test(entry.profile) && typeof entry.requestKey === 'string' && KEY.test(entry.requestKey)))) throw new Error('invalid speech lock entries')
      const lock = read as unknown as LockFile, requests = new Map<string, string | undefined>()
      for (const [key, entry] of Object.entries(lock.synthesis)) {
        const requestKey = entry.requestKey ?? key
        requests.set(requestKey, requests.has(requestKey) ? undefined : key)
        Object.freeze(entry)
      }
      Object.freeze(lock.synthesis)
      Object.freeze(lock)
      return this.#lockSnapshot = { version, lock, requests }
    } catch {
      this.#lockSnapshot = undefined
      return undefined
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }

  async #writeLock(synthesis: LockFile['synthesis']): Promise<void> {
    if (Object.keys(synthesis).length > MAX_LOCK_ENTRIES) throw new Error('synthesis lock exceeds its entry limit')
    const entries = Object.keys(synthesis).sort().map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(synthesis[k])}`)
    const text = `{\n  "version": 1,\n  "synthesis": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`
    if (Buffer.byteLength(text) > MAX_LOCK_BYTES) throw new Error('synthesis lock exceeds its byte limit')
    await this.#put(this.lockFile, text)
    this.#lockSnapshot = undefined
  }
}
