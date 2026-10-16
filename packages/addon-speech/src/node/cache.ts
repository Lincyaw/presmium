/**
 * A deck's synthesis cache (docs/ir.md 9.1), committed with the deck:
 * `.presmium/speech/<key>.<wav|ogg>` (the engine's format, labeled, never
 * re-encoded) with `<key>.json` (words, duration, format, engine, the same
 * AI-generated label), and `.presmium/speech.lock.json`, the keys the deck
 * used with the sha256 of their audio.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeechWord } from '@presmium/kernel'
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

function writeAtomic(file: string, data: string | Uint8Array): void {
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, data)
  renameSync(temporary, file)
}

export class SynthesisCache {
  readonly dir: string
  readonly lockFile: string

  constructor(deckDir: string) {
    this.dir = join(deckDir, '.presmium', 'speech')
    this.lockFile = join(deckDir, '.presmium', 'speech.lock.json')
  }

  /** The record and audio file of a key, when both are there. */
  find(key: string): { record: CacheRecord, file: string } | undefined {
    if (!/^[0-9a-f]{32}$/.test(key)) return undefined
    try {
      const record = JSON.parse(readFileSync(join(this.dir, `${key}.json`), 'utf8')) as CacheRecord
      if (!isRecord(record) || record.key !== key || typeof record.audio !== 'string') return undefined
      const file = join(this.dir, record.audio)
      if (!existsSync(file)) return undefined
      this.#lock(key, record)
      return { record, file }
    } catch {
      return undefined
    }
  }

  write(result: SynthesisResult, request: { lang: string, text: string }): { record: CacheRecord, file: string } {
    mkdirSync(this.dir, { recursive: true })
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
    writeAtomic(file, result.audio)
    writeAtomic(join(this.dir, `${result.key}.json`), `${JSON.stringify(record, null, 2)}\n`)
    this.#lock(result.key, record)
    return { record, file }
  }

  /** Adds a key to the lock file (sorted, one key per line), unless it is there with this audio. */
  #lock(key: string, record: CacheRecord): void {
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
    writeAtomic(this.lockFile, `{\n  "version": 1,\n  "synthesis": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`)
  }
}
