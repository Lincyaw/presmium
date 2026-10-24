import { spawn } from 'node:child_process'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const deck = mkdtempSync(join(FIXTURES, '.directory-'))
afterAll(() => rmSync(deck, { recursive: true, force: true }))

/** The document as the dev server gives its pages: the published name of the linked directory, and whether `text` is in it. */
async function published(site: string, text: string): Promise<{ name?: string, shown: boolean }> {
  const response = await fetch(`${site}__app/ir?document=`).catch(() => undefined)
  const ir = response?.ok ? await response.text() : ''
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
    const site = /^web {2}(http\S+)$/m.exec(output)![1]!
    await expect.poll(async () => (await published(site, '')).name, { timeout: 60_000 }).toBeDefined()
    const first = (await published(site, '')).name!

    appendFileSync(join(deck, 'lecture.md'), '\n第一次修改。\n')
    await expect.poll(async () => (await published(site, '第一次修改')).shown, { timeout: 60_000 }).toBe(true)
    expect((await published(site, '')).name).toBe(first)

    writeFileSync(join(deck, 'starter/data.csv'), 'x,y\n3,4\n')
    appendFileSync(join(deck, 'lecture.md'), '\n第二次修改。\n')
    await expect.poll(async () => (await published(site, '第二次修改')).shown, { timeout: 60_000 }).toBe(true)
    const second = (await published(site, '')).name!
    expect(second).not.toBe(first)
    expect(readFileSync(join(deck, '.presmium/files', second, 'data.csv'), 'utf8')).toBe('x,y\n3,4\n')
  } finally {
    child.kill('SIGTERM')
  }
  expect(await exited, output).toBe(0)
}, 300_000)
