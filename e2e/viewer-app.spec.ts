import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// The workbench's viewer app: prebuilt once for the workspace's plugins, a document's own code in a bundle of its own.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')

interface Served {
  child: ChildProcess
  url: string
  output: () => string
}

function serve(dir: string, cache: string): Promise<Served> {
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CACHE_HOME: cache }
  delete env.NODE_ENV
  const child = spawn(process.execPath, [PRESMIUM, 'serve', dir, '--port', '0'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  return new Promise((resolve, reject) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) resolve({ child, url: found[1]!, output: () => output })
    })
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    child.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
}

async function stop(served: Served | undefined): Promise<void> {
  const child = served?.child
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
  await exited
  clearTimeout(timer)
}

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let dir: string
let cache: string
let served: Served | undefined
// The app's files and the document's bundle that the first session's page loaded.
let loaded: { app: string, bundle: string } | undefined

async function pageFiles(page: import('@playwright/test').Page): Promise<{ app: string, bundle: string }> {
  return await page.evaluate(() => ({
    app: document.querySelector('base')!.getAttribute('href')!,
    bundle: (JSON.parse(document.getElementById('presmium-app')!.textContent!) as { bundle: string }).bundle,
  }))
}

test.beforeAll(() => {
  const work = join(ROOT, '.presmium')
  mkdirSync(work, { recursive: true })
  dir = mkdtempSync(join(work, 'e2e-viewer-app-'))
  rmSync(dir, { recursive: true })
  execFileSync(process.execPath, [join(ROOT, 'examples/animations/try.mjs'), dir], { stdio: 'pipe' })
  cpSync(fileURLToPath(new URL('./fixtures/viewer-app/vite-only', import.meta.url)), join(dir, 'vite-only'), { recursive: true })
  cache = mkdtempSync(join(work, 'e2e-viewer-cache-'))
})

test.afterAll(async () => {
  await stop(served)
  for (const path of [dir, cache]) if (path) rmSync(path, { recursive: true, force: true })
})

test('a lecture opens in the prebuilt viewer with its own scenes and components, follows its text, and reloads with its code', async ({ page }) => {
  served = await serve(dir, cache)
  const devPages: string[] = []
  let loads = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/bubble-sort/')) devPages.push(request.url())
  })
  page.on('load', () => loads++)
  page.on('pageerror', error => { throw error })

  await page.goto(`${served.url}/__app/view?document=bubble-sort`, { timeout: 120_000 })
  // The scene comes from the document's bundle (a plugin's document module), the component too.
  await expect(page.locator('.bs__bar').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.compare-count')).toContainText('比较次数')
  await expect(page.locator('script[type="importmap"]')).toHaveCount(1)
  expect(devPages).toEqual([])

  const lecture = join(dir, 'bubble-sort/lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('用一个动画讲清楚冒泡排序的一趟。', '改过的文字 capybara'))
  await expect(page.locator('.pm-section').first()).toContainText('改过的文字 capybara')
  expect(loads).toBe(1)

  const component = join(dir, 'bubble-sort/components/CompareCount.vue')
  writeFileSync(component, readFileSync(component, 'utf8').replace('比较次数：', '比较的次数：'))
  await expect(page.locator('.compare-count')).toContainText('比较的次数', { timeout: 60_000 })
  expect(loads).toBe(2)
  await expect(page.locator('.pm-section').first()).toContainText('改过的文字 capybara')
  expect(served.output()).toContain('the viewer app was built')
  // The text edit did not rebuild the bundle; the component's did, once.
  expect(served.output().match(/the code of bubble-sort was bundled/g)).toHaveLength(2)
  loaded = await pageFiles(page)
})

test('a second session takes the viewer and the bundles from the cache', async ({ page }) => {
  await stop(served)
  served = await serve(dir, cache)
  await page.goto(`${served.url}/__app/view?document=bubble-sort`)
  await expect(page.locator('.bs__bar').first()).toBeVisible()
  await expect(page.locator('.compare-count')).toContainText('比较的次数')
  expect(await pageFiles(page)).toEqual(loaded)
  expect(served.output()).not.toContain('the viewer app was built')
  expect(served.output()).not.toContain('was bundled')
})

test('a lecture whose plugin brings Vite plugins of its own is shown by its dev server', async ({ request }) => {
  const response = await request.get(`${served!.url}/__app/view?document=vite-only&presmium-preview=nonce`, { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers().location).toBe('/vite-only/?presmium-preview=nonce')
})
