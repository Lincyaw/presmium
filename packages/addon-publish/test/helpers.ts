import { execFile, execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const ADDON_DIR = fileURLToPath(new URL('..', import.meta.url))

// Scratch copies live inside the package so that the decks resolve @slidev/cli,
// the theme and playwright-chromium from its node_modules. Each fixture has its
// own package.json, so each copy gets its own Vite cache and tests can run in parallel.
const SCRATCH = fileURLToPath(new URL('./.tmp', import.meta.url))
const copies: string[] = []

/**
 * A fresh copy of `fixtures/<name>`, with `ADDON_DIR` in its slides.md replaced
 * by this addon's directory; call `removeCopies` in `afterAll`.
 */
export function copyFixture(name: string): string {
  mkdirSync(SCRATCH, { recursive: true })
  const dir = mkdtempSync(join(SCRATCH, `${name}-`))
  cpSync(join(FIXTURES, name), dir, { recursive: true, filter: src => !src.includes('node_modules') })
  const slides = join(dir, 'slides.md')
  writeFileSync(slides, readFileSync(slides, 'utf8').replace('ADDON_DIR', ADDON_DIR))
  copies.push(dir)
  return dir
}

export function removeCopies(): void {
  copies.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }))
}

/** The environment of a shell: without Vitest's NODE_ENV=test, which would change how Vite and Workbox build. */
export const SHELL_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV'))

export interface Run {
  code: number
  stdout: string
  stderr: string
}

/** Runs one of this package's bins as a real process. */
export function bin(name: 'presmium-export' | 'presmium-diff', cwd: string, ...args: string[]): Promise<Run> {
  const file = join(ADDON_DIR, 'bin', `${name}.mjs`)
  return new Promise((resolve) => {
    execFile(process.execPath, [file, ...args], { cwd, env: SHELL_ENV, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
  })
}

/** Runs this package's own `slidev`. */
export function slidev(cwd: string, ...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(join(ADDON_DIR, 'node_modules/.bin/slidev'), args, { cwd, env: SHELL_ENV }, error => (error ? reject(error) : resolve()))
  })
}

const GIT_ENV = { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com' }

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env: { ...SHELL_ENV, ...GIT_ENV }, encoding: 'utf8' }).trim()
}
