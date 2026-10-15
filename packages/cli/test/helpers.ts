// Runs the real `presmium` CLI process on copies of the decks in ./fixtures.
import { execFile } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'

export const BIN = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

// Each test works on a copy outside git, so the workspace root is the deck directory
// and lock files and caches are never written into the repository.
const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

export function fixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-cli-'))
  cpSync(FIXTURES, dir, { recursive: true })
  copies.push(dir)
  return dir
}

export interface Run {
  code: number
  stdout: string
  stderr: string
}

export function presmium(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
  })
}
