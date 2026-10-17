/**
 * A deck's synthesis cache (docs/ir.md 9.1), committed with the deck:
 * `.presmium/speech/<key>.<wav|ogg>` (the engine's format, labeled, never
 * re-encoded) with `<key>.json` (words, duration, format, engine, the same
 * AI-generated label), and `.presmium/speech.lock.json`, the keys the deck
 * used with the sha256 of their audio. In `presmium serve` the workspace's
 * `DOCUMENT_FILES` writes it (in SHARED mode agent-host, as the sandbox, so
 * no link the sandbox planted leads serve's writes elsewhere, WP-91).
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { DocumentFiles, SpeechWord } from '@presmium/kernel'
import { isRecord } from '@presmium/kernel'
import type { AigcLabel } from '../domain/index.ts'
import type { SynthesisResult } from './backend.ts'

/** `<key>.json`. */
export interface CacheRecord {
  key: string
  /** The audio file beside it. */
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

/** Writes beside `file` and renames over it, so a link at `file` is replaced rather than followed. */
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
  /** The workspace's writer when the host has one. */
  readonly #files: () => DocumentFiles | undefined

  constructor(deckDir: string, workspaceRoot = deckDir, files: () => DocumentFiles | undefined = () => undefined) {
    this.#deckDir = deckDir
    this.#workspaceRoot = workspaceRoot
    this.#files = files
    this.dir = join(deckDir, '.presmium', 'speech')
    this.lockFile = join(deckDir, '.presmium', 'speech.lock.json')
  }

  /** Writes a file of the cache: through the workspace's writer, else beside it and renamed over it. */
  async #put(file: string, data: string | Uint8Array): Promise<void> {
    const files = this.#files()
    if (!files) return writeAtomic(file, data)
    await files.write([{ path: relative(this.#workspaceRoot, file).split(sep).join('/'), content: typeof data === 'string' ? Buffer.from(data) : data }])
  }

  /** The cache directory resolves inside the deck (no linked `.presmium` or `speech`). */
  #contained(): boolean {
    const deck = realpathSync(this.#deckDir)
    const dir = realpathSync(this.dir)
    return dir === join(deck, '.presmium', 'speech')
  }

  /**
   * The record and audio file of a key, when both are there. The record is
   * committed with the deck and may be edited by anyone who edits the deck, so
   * nothing in it can point elsewhere: the audio must be `<key>.wav` or
   * `<key>.ogg`, and the cache directory, the record and the audio must be
   * real files inside the deck, not symbolic links.
   */
  async find(key: string): Promise<{ record: CacheRecord, file: string } | undefined> {
    if (!/^[0-9a-f]{32}$/.test(key)) return undefined
    let found: { record: CacheRecord, file: string }
    try {
      if (!this.#contained()) return undefined
      const json = join(this.dir, `${key}.json`)
      if (!lstatSync(json).isFile()) return undefined
      const record = JSON.parse(readFileSync(json, 'utf8')) as CacheRecord
      if (!isRecord(record) || record.key !== key || typeof record.audio !== 'string') return undefined
      if (record.audio !== `${key}.wav` && record.audio !== `${key}.ogg`) return undefined
      const file = join(this.dir, record.audio)
      if (!existsSync(file) || !lstatSync(file).isFile()) return undefined
      found = { record, file }
    } catch {
      return undefined
    }
    await this.#lock(key, found.record).catch(() => undefined)
    return found
  }

  async write(result: SynthesisResult, request: { lang: string, text: string }): Promise<{ record: CacheRecord, file: string }> {
    // The workspace's writer makes the directory, replacing a link on the way; here it is made and checked.
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

  /** Adds a key to the lock file (sorted, one key per line), unless it is there with this audio. */
  async #lock(key: string, record: CacheRecord): Promise<void> {
    let lock: LockFile = { version: 1, synthesis: {} }
    try {
      const read: unknown = JSON.parse(readFileSync(this.lockFile, 'utf8'))
      if (isRecord(read) && isRecord(read.synthesis)) lock = read as unknown as LockFile
    } catch {
      // None yet.
    }
    const known = lock.synthesis[key]
    if (known?.audio === record.audio && known.sha256 === record.sha256) return
    lock.synthesis[key] = { audio: record.audio, sha256: record.sha256 }
    const entries = Object.keys(lock.synthesis).sort().map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(lock.synthesis[k])}`)
    await this.#put(this.lockFile, `{\n  "version": 1,\n  "synthesis": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`)
  }
}
