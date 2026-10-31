import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SpeechSettingsAnswer, SpeechSettingsChange } from '../contracts/speech-settings.ts'

const KEY = 'PRESMIUM_SPEECH_VOLCENGINE_KEY', APPID = 'PRESMIUM_SPEECH_VOLCENGINE_APPID'
const MAX_BYTES = 16384
const lockfile = createRequire(import.meta.url)('proper-lockfile') as { lock(file: string, options: { realpath: boolean, retries: number }): Promise<() => Promise<void>> }
interface Stored { version: 1, revision: string, key?: string }
const empty = (): Stored => ({ version: 1, revision: 'none' })

export class SpeechSettingsError extends Error {
  readonly code: 'speech-settings-conflict' | 'speech-settings-invalid' | 'speech-settings-unavailable' | 'speech-settings-busy'
  constructor(code: SpeechSettingsError['code']) { super(code); this.code = code }
}

/** One operator-owned file; no values leave this module except through the Node secret resolver. */
export class OperatorSpeechSettings {
  readonly #file: string | undefined
  readonly #fallback: (name: string) => string | undefined
  constructor(directory: string | undefined, fallback: (name: string) => string | undefined) {
    this.#file = directory ? join(directory, 'speech', 'credentials.json') : undefined
    this.#fallback = fallback
  }
  #read(): Stored {
    if (!this.#file) return empty()
    let fd: number | undefined
    try {
      fd = openSync(this.#file, constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new SpeechSettingsError('speech-settings-unavailable')
      const value = JSON.parse(readFileSync(fd, 'utf8')) as Stored
      if (value?.version !== 1 || typeof value.revision !== 'string' || value.key !== undefined && typeof value.key !== 'string') throw new SpeechSettingsError('speech-settings-unavailable')
      return value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty()
      throw new SpeechSettingsError('speech-settings-unavailable')
    } finally { if (fd !== undefined) closeSync(fd) }
  }
  secret = (name: string): string | undefined => {
    if (name !== KEY && name !== APPID) return this.#fallback(name)
    const saved = this.#read()
    // API-key authentication must not inherit a different environment credential's App ID.
    if (name === APPID && saved.key) return undefined
    return (name === KEY ? saved.key : undefined) ?? this.#fallback(name)
  }
  read(): SpeechSettingsAnswer {
    const value = this.#read(), key = value.key ?? this.#fallback(KEY)?.trim()
    return { provider: 'volcengine', model: 'seed-tts-2.0', revision: value.revision, configured: Boolean(key), source: value.key ? 'saved' : key ? 'environment' : 'none', stored: Boolean(value.key), writable: Boolean(this.#file), verification: 'configuration-only' }
  }
  async change(change: SpeechSettingsChange): Promise<SpeechSettingsAnswer> {
    if (!this.#file) throw new SpeechSettingsError('speech-settings-unavailable')
    const directory = dirname(this.#file)
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      if (lstatSync(directory).isSymbolicLink()) throw new Error('unsafe-directory')
    } catch { throw new SpeechSettingsError('speech-settings-unavailable') }
    let release: () => Promise<void>
    try { release = await lockfile.lock(this.#file, { realpath: false, retries: 0 }) }
    catch { throw new SpeechSettingsError('speech-settings-busy') }
    let temporary: string | undefined
    try {
      const previous = this.#read()
      if (change.revision !== previous.revision) throw new SpeechSettingsError('speech-settings-conflict')
      let next: Stored = { version: 1, revision: randomUUID() }
      if (change.action === 'save') {
        const key = change.apiKey?.trim() || previous.key || this.#fallback(KEY)?.trim()
        if (!key || !/^[\x21-\x7e]{8,8192}$/.test(key)) throw new SpeechSettingsError('speech-settings-invalid')
        next = { ...next, key }
      }
      temporary = `${this.#file}.${randomUUID()}.tmp`
      writeFileSync(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, this.#file)
      temporary = undefined
      return this.read()
    } catch (error) {
      if (error instanceof SpeechSettingsError) throw error
      throw new SpeechSettingsError('speech-settings-unavailable')
    } finally {
      if (temporary) rmSync(temporary, { force: true })
      await release()
    }
  }
}

export function operatorSpeechSecrets(directory: string | undefined, fallback: (name: string) => string | undefined): (name: string) => string | undefined {
  return new OperatorSpeechSettings(directory, fallback).secret
}
