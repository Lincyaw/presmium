import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { connectMcp, resultOf } from '../packages/mcp/test/client.ts'
import { deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'

test.describe.configure({ mode: 'serial', timeout: 180_000 })
let dir: string
let dev: DevServer
let mcp: Awaited<ReturnType<typeof connectMcp>>

test.beforeAll(async () => {
  dir = deckDir('exec-feedback')
  cpSync(fileURLToPath(new URL('./fixtures/exec/results', import.meta.url)), dir, { recursive: true })
  const file = join(dir, 'lecture.md')
  writeFileSync(file, `${readFileSync(file, 'utf8')}
(failed-query)=
## 查询失败

\`\`\`{code} python
:run: live
raise ValueError('query needs a key')
\`\`\`
`)
  dev = await startDev(dir, 'web')
  const state = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { mcp: string, token: string }
  mcp = await connectMcp(state.mcp, state.token)
})
test.afterAll(async () => {
  await mcp?.close()
  await dev?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('get_runtime observes the browser query value, a session reset and a failed live query', async ({ page }) => {
  await openDevPage(page, dev.url, page.locator('.pm-section').first())
  const recent = async () => {
    const result = resultOf<{ windows: { status: Record<string, { recent?: Record<string, unknown>[] }> }[] }>(await mcp.callTool({ name: 'get_runtime', arguments: {} }))
    return result.windows.flatMap(window => window.status['presmium.exec']?.recent ?? [])
  }
  const panel = page.locator('.pm-section[data-section="query-results"] .pm-run-panel')
  const block = await panel.evaluate(element => element.closest<HTMLElement>('[data-block]')!.dataset.block)
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText("[('Ada', 37)]", { timeout: 30_000 })
  await expect.poll(recent).toContainEqual(expect.objectContaining({ section: 'query-results', block, lang: 'python', state: 'succeeded', value: "[('Ada', 37)]", executor: 'pyodide' }))

  const session = page.locator('.pm-section[data-section="reset-session"] .pm-run-panel')
  await session.locator('.pm-run-panel__run').click()
  await expect(session.locator('.pm-run-panel__stdout')).toHaveText('1')
  await session.getByRole('button', { name: '重置会话' }).click()
  await expect.poll(recent).toContainEqual(expect.objectContaining({ type: 'reset-session', state: 'reset', session: 'database' }))

  const failed = page.locator('.pm-section[data-section="failed-query"] .pm-code-block')
  await failed.getByRole('button', { name: '运行', exact: true }).click()
  await expect(failed.locator('.pm-output__error')).toContainText('ValueError: query needs a key')
  await expect.poll(recent).toContainEqual(expect.objectContaining({ section: 'failed-query', state: 'failed', stderr: expect.stringContaining('ValueError: query needs a key') }))
  const feedback = await recent()
  expect(feedback).toHaveLength(4)
  expect(feedback.every(entry => entry.code === undefined)).toBe(true)
})
