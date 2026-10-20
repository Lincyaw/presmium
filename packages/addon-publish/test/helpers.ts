import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, run } from '@lincyaw/cli/testing'
import type { Run } from '@lincyaw/cli/testing'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const ADDON_DIR = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES_DIR = fileURLToPath(new URL('../..', import.meta.url))

const SCRATCH = fileURLToPath(new URL('./.tmp', import.meta.url))
const copies: string[] = []

export function copyFixture(name: string, entry = 'lecture.md'): string {
  mkdirSync(SCRATCH, { recursive: true })
  const dir = mkdtempSync(join(SCRATCH, `${name}-`))
  cpSync(join(FIXTURES, name), dir, { recursive: true, filter: src => !src.includes('node_modules') })
  const lecture = join(dir, entry)
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('ADDON_DIR', ADDON_DIR).replace(/PACKAGES_DIR\//g, PACKAGES_DIR))
  copies.push(dir)
  return dir
}

export function repository(name: string, entry?: string, prepare?: (dir: string) => void): string {
  const dir = copyFixture(name, entry)
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
  prepare?.(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', name)
  return dir
}

export function removeCopies(): void {
  copies.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }))
}

export const SHELL_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV'))

export type { Run }

const BINS = {
  'presmium-export': join(ADDON_DIR, 'bin/presmium-export.mjs'),
  'presmium-diff': join(ADDON_DIR, 'bin/presmium-diff.mjs'),
}

export function bin(name: keyof typeof BINS | 'presmium', cwd: string, ...args: string[]): Promise<Run> {
  if (name === 'presmium') return presmium(cwd, args)
  return run(process.execPath, [BINS[name], ...args], { cwd, env: SHELL_ENV })
}

const GIT_ENV = { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' }

export function command(cwd: string, name: string, ...args: string[]): string {
  const result = spawnSync(name, args, { cwd, env: { ...SHELL_ENV, ...GIT_ENV }, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${name} ${args.join(' ')} failed (${result.status}): ${result.stderr}`)
  return result.stdout.trim()
}

export function git(cwd: string, ...args: string[]): string {
  return command(cwd, 'git', '-c', 'commit.gpgsign=false', ...args)
}
