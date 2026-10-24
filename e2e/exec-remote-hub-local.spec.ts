import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { deckDir, presmium, serve } from './fixtures/deck.ts'
import { localHubProxy, localHubPython, startLocalHub } from './fixtures/exec-remote-hub-local/jupyterhub.ts'
import type { LocalHub } from './fixtures/exec-remote-hub-local/jupyterhub.ts'

test.describe.configure({ mode: 'default' })
test.skip(!localHubPython || !localHubProxy, 'set PRESMIUM_TEST_JUPYTER_PYTHON (with jupyterhub) and PRESMIUM_TEST_JUPYTER_PROXY (configurable-http-proxy)')

let hub: LocalHub | undefined
let dir: string | undefined
let site: Awaited<ReturnType<typeof serve>> | undefined

test.beforeAll(async () => {
  test.setTimeout(240_000)
  hub = await startLocalHub(localHubPython!, localHubProxy!)
  dir = deckDir('exec-remote-hub-local', { '@lincyaw/addon-exec-jupyter': 'packages/addon-exec-jupyter' })
  const lecture = readFileSync(new URL('./fixtures/exec-remote-hub-local/lecture.md', import.meta.url), 'utf8')
  writeFileSync(join(dir, 'lecture.md'), lecture.replace('__HUB_URL__', hub.url))
  await presmium(['build', '--to', 'web'], dir)
  site = await serve(join(dir, 'dist/web'))
})

test.afterAll(async () => {
  await site?.close()
  await hub?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('a rejected Hub token can be replaced, then discovers its learner and runs in their user server', async ({ page }) => {
  test.setTimeout(120_000)
  const kernels: string[] = []
  const discovery: string[] = []
  const failures: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (path.endsWith('/hub/api/user')) discovery.push(path)
    if (path.includes('/api/kernels')) kernels.push(path)
  })
  page.on('pageerror', error => failures.push(error.message))
  await page.goto(`${site!.url}/?section=mine`, { waitUntil: 'domcontentloaded' })
  const code = page.locator('.pm-block[data-block="whose"]')
  await code.locator('.pm-code-block__run button').first().click()
  const dialog = page.getByRole('dialog', { name: '环境 hub 的令牌' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('令牌').fill('invalid-hub-token')
  await dialog.getByRole('button', { name: '连接' }).click()
  await expect(code).toContainText(/拒绝了令牌|401|403|Failed to fetch/, { timeout: 30_000 })
  expect(await page.evaluate(() => sessionStorage.getItem('presmium.execJupyter.token:hub'))).toBeNull()
  await code.locator('.pm-code-block__run button').first().click()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('令牌').fill(hub!.token)
  await dialog.getByRole('button', { name: '连接' }).click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', { timeout: 60_000 })
  await expect(code.locator('.pm-output__stdout')).toHaveText(`服务器属于 ${hub!.user}\n42\n`)
  expect(discovery).toContain('/hub/api/user')
  expect(kernels.length).toBeGreaterThan(0)
  expect(kernels.every(path => path.startsWith(`/user/${hub!.user}/api/kernels`))).toBe(true)
  expect(await page.evaluate(() => sessionStorage.getItem('presmium.execJupyter.token:hub'))).toBe(hub!.token)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(hub!.token)
  expect(failures).toEqual([])
  await expect.poll(() => hub!.userApi('kernels')).toEqual([])
  await expect.poll(async () => (await hub!.userApi('contents/presmium-runs?content=1') as { content: unknown[] }).content).toEqual([])
})
