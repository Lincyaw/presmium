// `presmium build --to web` on a deck that turns offline support off (`presmium.publish.offline: false`):
// the site is built without the service worker that would precache it.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/offline', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))

const out = mkdtempSync(join(tmpdir(), 'presmium-web-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

it('with offline support turned off, the web build has no service worker', async () => {
  const { code, output } = await new Promise<{ code: number, output: string }>((resolve) => {
    execFile(process.execPath, [PRESMIUM, 'build', '--to', 'web', '--out', out], { cwd: DECK, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr })
    })
  })
  expect(code, output).toBe(0)
  expect(readFileSync(join(out, 'web/index.html'), 'utf8')).toContain('关闭离线')
  expect(existsSync(join(out, 'web/presmium-sw.js'))).toBe(false)
}, 180_000)
