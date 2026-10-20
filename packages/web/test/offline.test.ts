import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/offline', import.meta.url))

const out = mkdtempSync(join(tmpdir(), 'presmium-web-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

it('with offline support turned off, the web build has no service worker', async () => {
  const { code, stdout, stderr } = await presmium(DECK, ['build', '--to', 'web', '--out', out])
  expect(code, stdout + stderr).toBe(0)
  expect(readFileSync(join(out, 'web/index.html'), 'utf8')).toContain('关闭离线')
  expect(existsSync(join(out, 'web/presmium-sw.js'))).toBe(false)
}, 180_000)
