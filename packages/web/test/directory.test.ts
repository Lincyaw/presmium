import { spawn } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const deck = mkdtempSync(join(FIXTURES, '.directory-'))
afterAll(() => rmSync(deck, { recursive: true, force: true }))

function published(text: string): { name?: string, shown: boolean } {
  const file = join(deck, 'dev/web/ir.json')
  const ir = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return { name: /media\/([\da-f]{8}-starter)\/index\.html/.exec(ir)?.[1], shown: ir.includes(text) }
}

it('keeps a linked directory\'s published name while its files do not change, and publishes it anew once one does', async () => {
  cpSync(join(FIXTURES, 'directory'), deck, { recursive: true })
  writeFileSync(join(deck, '.gitignore'), '*\n')
  const { NODE_ENV: _test, ...env } = process.env
  const child = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '.', '--to', 'web', '--out', 'dev', '--server-port', '5044'], { cwd: deck, env })
  const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  try {
    await expect.poll(() => output, { timeout: 120_000 }).toContain('watching;')
    await expect.poll(() => published('').name, { timeout: 60_000 }).toBeDefined()
    const first = published('').name!

    appendFileSync(join(deck, 'lecture.md'), '\n第一次修改。\n')
    await expect.poll(() => published('第一次修改').shown, { timeout: 60_000 }).toBe(true)
    expect(published('').name).toBe(first)

    writeFileSync(join(deck, 'starter/data.csv'), 'x,y\n3,4\n')
    appendFileSync(join(deck, 'lecture.md'), '\n第二次修改。\n')
    await expect.poll(() => published('第二次修改').shown, { timeout: 60_000 }).toBe(true)
    const second = published('').name!
    expect(second).not.toBe(first)
    expect(readFileSync(join(deck, '.presmium/files', second, 'data.csv'), 'utf8')).toBe('x,y\n3,4\n')
  } finally {
    child.kill('SIGTERM')
  }
  expect(await exited, output).toBe(0)
}, 300_000)
