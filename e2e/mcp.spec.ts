import { cpSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { connectMcp, resultOf } from '../packages/mcp/test/client.ts'
import { deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/mcp', import.meta.url))

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let dir: string
let dev: DevServer
let mcp: Awaited<ReturnType<typeof connectMcp>>

test.beforeAll(async () => {
  test.setTimeout(300_000)
  dir = deckDir('mcp')
  cpSync(FIXTURE, dir, { recursive: true })
  dev = await startDev(dir, 'web')
  const state = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { mcp: string, token: string }
  mcp = await connectMcp(state.mcp, state.token)
})
test.afterAll(async () => {
  await mcp?.close()
  await dev?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('navigate asks in the present view\'s control bar, and once allowed there the view shows the third section', async ({ page }) => {
  const present = page.locator('.pm-present')
  await openDevPage(page, `${dev.url}?view=present`, present)
  await expect(present).toHaveAttribute('data-section', 'mcp-端到端测试文稿')
  await expect.poll(async () => resultOf(await mcp.callTool({ name: 'get_position', arguments: {} })).position?.view).toBe('present')

  let updates = 0
  mcp.setNotificationHandler('notifications/resources/updated', (n) => {
    if (n.params.uri === 'presmium://position') updates++
  })
  const subscription = await mcp.listen({ resourceSubscriptions: ['presmium://position'] })

  const moved = mcp.callTool({ name: 'navigate', arguments: { section: '第三节' } })
  const entry = present.locator('.pm-present__bar .pm-approvals__toggle')
  await expect(entry).toHaveText('待确认 1')
  await entry.click()
  const dialog = present.getByRole('dialog', { name: '待确认的操作' })
  await expect(dialog).toBeInViewport()
  await expect(dialog.locator('.pm-approvals__title')).toHaveText('放映跳转到「第三节」')
  updates = 0
  await dialog.getByRole('button', { name: '允许' }).click()

  const result = await moved
  expect(result.isError).toBeFalsy()
  expect(resultOf(result)).toMatchObject({ section: '第三节', step: 0, windows: 1 })
  await expect(present).toHaveAttribute('data-section', '第三节')
  await expect(entry).toHaveCount(0)
  const where = async () => JSON.parse(((await mcp.readResource({ uri: 'presmium://position' })).contents[0] as { text: string }).text).position
  await expect.poll(async () => updates > 0 && (await where())?.section).toBe('第三节')
  await subscription.close()
})

test('a plugin\'s STATUS summary reaches get_classroom while a page is open', async ({ page }) => {
  await openDevPage(page, dev.url, page.locator('.pm-section').first())
  await expect.poll(async () => resultOf(await mcp.callTool({ name: 'get_classroom', arguments: {} })).classroom['fixture.mcp'], { timeout: 15_000 })
    .toEqual({ answered: 3, question: '哪一对先合并？' })
})
