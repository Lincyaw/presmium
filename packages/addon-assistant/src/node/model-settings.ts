/**
 * The model settings the operator saves in the page (P-111, N-08): a file of
 * the user's configuration directory, `$XDG_CONFIG_HOME/presmium/assistant.json`
 * (`~/.config/presmium/` without it), that only the user may read (0600, its
 * directory 0700), never in a workspace or a deck. Read again whenever the
 * assistant starts an agent, so a saved change applies to the next session
 * without a restart.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { modelSettingsOf } from '../domain/index.ts'
import type { ModelSettings } from '../domain/index.ts'

type Secret = (name: string) => string | undefined

/** The file of the page's model settings, by the process's environment. */
export function settingsFile(secret: Secret): string {
  return join(secret('XDG_CONFIG_HOME') || join(secret('HOME') || homedir(), '.config'), 'presmium', 'assistant.json')
}

/** The saved settings; undefined when there are none or the file cannot be read. */
export function readModelSettings(file: string): ModelSettings | undefined {
  try {
    return existsSync(file) ? modelSettingsOf(JSON.parse(readFileSync(file, 'utf8'))) : undefined
  } catch {
    return undefined
  }
}

/** Saves the settings: written whole beside the file, then moved over it, readable by the user only. */
export function writeModelSettings(file: string, settings: ModelSettings): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const next = `${file}.${process.pid}.tmp`
  writeFileSync(next, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
  // An existing file kept its mode; the new content is the user's alone either way.
  chmodSync(next, 0o600)
  renameSync(next, file)
}

export function removeModelSettings(file: string): void {
  rmSync(file, { force: true })
}
