import { cpSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { buildFixture, deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/server')
const LINK = { '@presmium/host': 'packages/host' }

test.describe('presmium dev', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  let dev: DevServer
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = deckDir('server-dev', LINK)
    cpSync(FIXTURE, dir, { recursive: true })
    dev = await startDev(dir, 'web')
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('a component shows the server\'s answer, and the toolbar asks for the route\'s approval', async ({ page }) => {
    const component = page.locator('.fixture-server')
    await openDevPage(page, dev.url, component.locator('.fixture-server__value', { hasText: '来自服务端的回答' }))
    const entry = page.locator('.pm-approvals__toggle')
    await expect(entry).toHaveCount(0)

    for (const [choice, outcome] of [['允许', '已允许'], ['拒绝', '已拒绝']] as const) {
      await component.getByRole('button', { name: '请求确认' }).click()
      await expect(component.locator('.fixture-server__result')).toHaveText('等待确认')
      await expect(entry).toHaveText('待确认 1')
      await entry.click()
      const dialog = page.getByRole('dialog', { name: '待确认的操作' })
      await expect(dialog.locator('.pm-approvals__title')).toHaveText('运行测试操作')
      await dialog.getByRole('button', { name: choice }).click()
      await expect(component.locator('.fixture-server__result')).toHaveText(outcome)
      await expect(entry).toHaveCount(0)
    }
  })

  test('the dev server\'s own endpoints refuse other sites\' pages: a rebound host name, a cross-site request, a plain GET to open the editor', async () => {
    const send = (path: string, headers: Record<string, string>, method = 'GET') => new Promise<{ status: number, body: string }>((done, fail) => {
      const url = new URL(path, dev.url)
      const req = request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method, headers }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => (body += chunk))
        res.on('end', () => done({ status: res.statusCode!, body }))
      })
      req.on('error', fail)
      req.end()
    })
    const local = `${new URL(dev.url).host}`
    expect((await send('/__presmium/ir', { Host: local })).status).toBe(200)
    const rebound = await send('/__presmium/ir', { Host: 'rebind.attacker.example' })
    expect(rebound.status).toBe(403)
    expect(rebound.body).not.toContain('"doc"')
    expect((await send('/__presmium/ir', { 'Host': local, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await send('/__presmium/source?file=lecture.md&line=1', { Host: local })).status).toBe(405)
    expect((await send('/__presmium/source?file=lecture.md&line=1', { 'Host': local, 'Sec-Fetch-Site': 'cross-site' }, 'POST')).status).toBe(403)
  })
})

test.describe('static output', () => {
  test.describe.configure({ mode: 'serial' })
  let deck: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await buildFixture('server', { to: 'web', link: LINK })
  })
  test.afterAll(async () => {
    await deck?.close()
  })

  test('without a server the component degrades and the toolbar has no approvals', async ({ page }) => {
    await page.goto(deck.web)
    await expect(page.locator('.fixture-server__value')).toHaveText('服务端不可用')
    await expect(page.locator('.fixture-server__ask')).toHaveCount(0)
    await expect(page.locator('.pm-approvals')).toHaveCount(0)
  })

  test('the IR runtime reports go as the present view moves, and a replayed go moves it without a report', async ({ page }) => {
    await page.goto(`${deck.web}/?view=present`)
    const present = page.locator('.pm-present')
    await expect(present).toHaveAttribute('data-section', '服务端')
    await expect.poll(() => page.evaluate(() => Array.isArray(window.fixtureOperations))).toBe(true)
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', '步骤')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '1')
    await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-step', '2')
    const reported = await page.evaluate(() => window.fixtureOperations!.filter(op => op.type === 'go').map(op => op.data))
    expect(reported).toEqual(expect.arrayContaining([
      { section: '步骤', step: 0, view: 'present' },
      { section: '步骤', step: 1, view: 'present' },
      { section: '步骤', step: 2, view: 'present' },
    ]))

    await page.keyboard.press('End')
    await expect(present).toHaveAttribute('data-section', '结尾')
    const before = await page.evaluate(() => window.fixtureOperations!.length)
    const replayed = await page.evaluate(() => window.fixtureReplay!({ type: 'go', data: { section: '步骤', step: 1, view: 'present' } }))
    expect(replayed).toBe(true)
    await expect(present).toHaveAttribute('data-section', '步骤')
    await expect(present).toHaveAttribute('data-step', '1')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.fixtureOperations!.length)).toBe(before)
  })

  test('the presenter window shows the mark of a role without children; the document and present views do not', async ({ page }) => {
    await page.goto(deck.web)
    const narration = page.locator('.pm-section[data-section="服务端"] .pm-block--narration')
    await expect(narration).toContainText('可见的角色')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)

    await page.goto(`${deck.web}/?view=present`)
    await expect(page.locator('.pm-present')).toHaveAttribute('data-section', '服务端')
    await expect(page.locator('.pm-role-mark')).toHaveCount(0)

    const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
    const notes = presenter.locator('.pm-presenter__notes')
    await expect(notes).toContainText('可见的角色')
    await expect(notes.locator('.pm-role-mark')).toHaveText('〔probe hidden〕')
  })
})
