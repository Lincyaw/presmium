// Runs the real `presmium` CLI process on copies of the decks in ./fixtures.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'

export { PRESMIUM_BIN as BIN, presmium, run } from '../src/testing.ts'
export type { Run } from '../src/testing.ts'

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
