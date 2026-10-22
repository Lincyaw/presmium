import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { deckDir, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
let dir: string
let dev: DevServer

test.beforeAll(async () => {
  test.setTimeout(120_000)
  dir = deckDir('exec-lifecycle')
  cpSync(fileURLToPath(new URL('./fixtures/exec-lifecycle/lecture.md', import.meta.url)), join(dir, 'lecture.md'))
  dev = await startDev(dir, 'web', {
    NODE_ENV: 'development', UV_THREADPOOL_SIZE: '2', GOMAXPROCS: '1', RAYON_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', BLIS_NUM_THREADS: '1',
  })
})

test.afterAll(async () => {
  await dev?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function open(page: Page, section: string): Promise<Locator> {
  const url = new URL(dev.url)
  url.hash = section
  await page.goto(url.href, { waitUntil: 'domcontentloaded' })
  const panel = page.locator(`.pm-section[data-section="${section}"] .pm-run-panel`)
  await expect(panel.locator('.pm-run-panel__run')).toBeEnabled({ timeout: 30_000 })
  return panel
}

async function run(panel: Locator, output: string): Promise<void> {
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel).toHaveAttribute('data-state', 'done', { timeout: 45_000 })
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText(`${output}\n`)
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live')
}

const workers = (page: Page, name: string) => page.workers().filter(worker => worker.url().includes(`${name}.worker`)).length

test('resetting a running Python session cancels its worker and restarts the demonstration from its first result', async ({ page }) => {
  test.setTimeout(120_000)
  let pythonWorkersCreated = 0
  page.on('worker', worker => {
    if (worker.url().includes('pyodide.worker')) pythonWorkersCreated++
  })
  try {
    const panel = await open(page, 'python-session')
    await run(panel, '1')
    await run(panel, '2')
    expect(workers(page, 'pyodide')).toBe(1)
    await panel.locator('input[name="wait"]').fill('true')
    const beganWaiting = page.waitForEvent('console', message => message.text() === 'exec-python-wait-started')
    await panel.locator('.pm-run-panel__run').click()
    await beganWaiting
    await expect(panel).toHaveAttribute('data-state', 'running')
    await panel.getByRole('button', { name: '重置会话' }).click()
    await expect(panel).toHaveAttribute('data-state', 'idle')
    await expect(panel).toHaveAttribute('data-runs', '0')
    await expect(panel.locator('.pm-run-panel__output')).toHaveCount(0)
    await expect.poll(() => workers(page, 'pyodide')).toBe(0)
    await panel.locator('input[name="wait"]').fill('false')
    await run(panel, '1')
    expect(workers(page, 'pyodide')).toBe(1)
    // Host suspension must cancel queued jobs as well as the currently running one.
    await panel.locator('input[name="wait"]').fill('true')
    const beganSecondWait = page.waitForEvent('console', message => message.text() === 'exec-python-wait-started')
    await panel.locator('.pm-run-panel__run').click()
    await beganSecondWait
    const queued = page.locator('.pm-section[data-section="queued-python"] .pm-run-panel')
    await queued.locator('.pm-run-panel__run').click()
    await expect(queued).toHaveAttribute('data-state', 'running')
    const beforeSuspension = pythonWorkersCreated
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await expect(panel).not.toHaveAttribute('data-state', 'running')
    await expect(queued).not.toHaveAttribute('data-state', 'running')
    await expect(queued.locator('.pm-run-panel__output')).not.toContainText('queued-42')
    await expect.poll(() => workers(page, 'pyodide'), { timeout: 5000 }).toBe(0)
    expect(pythonWorkersCreated).toBe(beforeSuspension)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect(queued.locator('.pm-run-panel__run')).toBeEnabled()
    await run(queued, 'queued-42')
    expect(workers(page, 'pyodide')).toBe(1)
    expect(pythonWorkersCreated).toBe(beforeSuspension + 1)
  } finally {
    await page.goto('about:blank')
  }
})

test('JavaScript and TypeScript run with parameters, and suspending the page stops an active script worker before restoring it', async ({ page }) => {
  test.setTimeout(90_000)
  let mainFrameNavigations = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) mainFrameNavigations++
  })
  try {
    const javascript = await open(page, 'javascript')
    const beforeFirstRun = mainFrameNavigations
    await run(javascript, '42')
    expect(mainFrameNavigations).toBe(beforeFirstRun)
    await expect.poll(() => workers(page, 'script')).toBe(0)
    const panel = await open(page, 'typescript')
    await run(panel, '42')
    await panel.locator('input[name="value"]').fill('22')
    await run(panel, '44')
    await expect(panel.locator('.pm-run-panel__compare [data-arg="value"]')).toContainText('21 → 22')
    await panel.locator('input[name="wait"]').fill('true')
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel).toHaveAttribute('data-state', 'running')
    await expect.poll(() => workers(page, 'script')).toBe(1)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await expect.poll(() => workers(page, 'script'), { timeout: 5000 }).toBe(0)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect(panel.locator('.pm-run-panel__run')).toBeEnabled()
    await panel.locator('input[name="wait"]').fill('false')
    await run(panel, '44')
  } finally {
    await page.goto('about:blank')
  }
})
