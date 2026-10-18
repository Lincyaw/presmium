import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'

export { PRESMIUM_BIN as BIN, presmium, run } from '../src/testing.ts'
export type { Run } from '../src/testing.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

export function fixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-cli-'))
  cpSync(FIXTURES, dir, { recursive: true })
  copies.push(dir)
  return dir
}
