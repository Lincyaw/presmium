import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { modelSettingsOf } from '../domain/index.ts'
import type { ModelSettings } from '../domain/index.ts'

type Secret = (name: string) => string | undefined

export function settingsFile(secret: Secret): string {
  return join(secret('XDG_CONFIG_HOME') || join(secret('HOME') || homedir(), '.config'), 'presmium', 'assistant.json')
}

export function readModelSettings(file: string): ModelSettings | undefined {
  try {
    return existsSync(file) ? modelSettingsOf(JSON.parse(readFileSync(file, 'utf8'))) : undefined
  } catch {
    return undefined
  }
}

export function writeModelSettings(file: string, settings: ModelSettings): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const next = `${file}.${process.pid}.tmp`
  writeFileSync(next, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, file)
}

export function removeModelSettings(file: string): void {
  rmSync(file, { force: true })
}
