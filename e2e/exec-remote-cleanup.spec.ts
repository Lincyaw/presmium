import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import { deckDir, startDev } from './fixtures/deck.ts'
import type { DevServer } from './fixtures/deck.ts'
import { localPython, startLocalJupyter } from '../packages/addon-exec-jupyter/test/local-jupyter.ts'
import type { LocalJupyter } from '../packages/addon-exec-jupyter/test/local-jupyter.ts'

test.describe.configure({ mode: 'default' })
test.skip(!localPython, 'set PRESMIUM_TEST_JUPYTER_PYTHON to a Python with jupyter_server and ipykernel installed')

let jupyter: LocalJupyter | undefined
let dev: DevServer | undefined
let dir: string | undefined

test.beforeAll(async () => {
  test.setTimeout(180_000)
  jupyter = await startLocalJupyter(localPython!)
  dir = deckDir('exec-remote-cleanup', { '@lincyaw/slidev-addon-exec-jupyter': 'packages/addon-exec-jupyter' })
  cpSync(fileURLToPath(new URL('./fixtures/exec-remote-cleanup/lecture.md', import.meta.url)), join(dir, 'lecture.md'))
  dev = await startDev(dir, 'web', {
    NODE_ENV: 'development',
    PRESMIUM_ENV_LAB_URL: jupyter.url,
    PRESMIUM_ENV_LAB_TOKEN: jupyter.token,
    UV_THREADPOOL_SIZE: '2', GOMAXPROCS: '1', RAYON_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', BLIS_NUM_THREADS: '1',
  })
})

test.afterAll(async () => {
  await dev?.stop()
  await jupyter?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function run(block: Locator, output: string): Promise<void> {
  await block.locator('.pm-code-block__run button').first().click()
  await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', { timeout: 60_000 })
  await expect(block.locator('.pm-output__stdout')).toHaveText(`${output}\n`)
}

async function resources() {
  const [kernels, terminals, runs] = await Promise.all([
    jupyter!.api('kernels') as Promise<unknown[]>,
    jupyter!.api('terminals') as Promise<unknown[]>,
    jupyter!.api('contents/presmium-runs?content=1') as Promise<{ content: unknown[] }>,
  ])
  return { kernels: kernels.length, terminals: terminals.length, directories: runs.content.length }
}

test('finished runs and leaving the page release remote kernels, nested execution files and terminals', async ({ page }) => {
  test.setTimeout(180_000)
  const requests: string[] = []
  page.on('request', request => requests.push(`${request.url()} ${JSON.stringify(request.headers())}`))
  await page.goto(dev!.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  const transient = page.locator('.pm-block[data-block="transient"]')
  await expect(transient.locator('.pm-code-block__run button').first()).toBeEnabled({ timeout: 60_000 })
  await run(transient, 'transient-42')
  await expect.poll(resources, { timeout: 20_000 }).toEqual({ kernels: 0, terminals: 0, directories: 0 })

  for (let visit = 0; visit < 2; visit++) {
    if (visit) await page.goto(dev!.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await run(page.locator('.pm-block[data-block="persistent"]'), 'session-42')
    const terminal = page.locator('.pm-terminal[data-env="lab"]')
    await terminal.locator('.pm-terminal__open').click()
    await expect(terminal).toHaveAttribute('data-state', 'open', { timeout: 60_000 })
    await expect.poll(resources).toEqual({ kernels: 1, terminals: 1, directories: 1 })
    expect(requests.join('\n').includes(jupyter!.token)).toBe(false)
    if (visit) await page.close()
    else await page.goto('about:blank')
    // The proxy remains alive while the former page no longer has a JavaScript context.
    await expect.poll(resources, { timeout: 20_000 }).toEqual({ kernels: 0, terminals: 0, directories: 0 })
  }
})

test('the cleanup route rejects traversal, extra connection fields and undeclared environments', async ({ request }) => {
  const endpoint = new URL('/__presmium/presmium.execJupyter/cleanup/lab', dev!.url).href
  const valid = { kernel: 'test-kernel', directory: 'presmium-runs/abc-def' }
  expect((await request.get(endpoint)).status()).toBe(405)
  expect((await request.post(endpoint, { data: { ...valid, padding: 'x'.repeat(1100) } })).status()).toBe(413)
  for (const data of [
    { ...valid, directory: 'presmium-runs/../other' },
    { ...valid, kernel: '../other' },
    { ...valid, url: jupyter!.url },
    { ...valid, token: 'must-not-be-forwarded' },
  ]) {
    const response = await request.post(endpoint, { data })
    expect(response.status()).toBe(400)
    expect((await response.text()).includes(jupyter!.token)).toBe(false)
  }
  const unknown = await request.post(endpoint.replace('/lab', '/undeclared'), { data: valid })
  expect(unknown.status()).toBe(404)
  expect((await unknown.text()).includes(jupyter!.token)).toBe(false)
  for (let repeat = 0; repeat < 2; repeat++) expect((await request.post(endpoint, { data: valid })).status()).toBe(204)
  expect(await resources()).toEqual({ kernels: 0, terminals: 0, directories: 0 })
})

test('a remote cleanup failure warns while preserving a successful live execution result', async ({ page }) => {
  test.setTimeout(120_000)
  const warnings: string[] = []
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  await page.goto(dev!.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await run(page.locator('.pm-block[data-block="hidden"]'), '42')
  await expect.poll(() => warnings.join('\n')).toContain('[presmium] Jupyter cleanup failed')
  // The default Contents API cannot list .hidden, and trash is disabled, so it
  // refuses to delete this nonempty directory. The helper removes its isolated
  // server root after the test; the successful code output must remain usable.
  expect(await resources()).toEqual({ kernels: 0, terminals: 0, directories: 1 })
  await expect(page.locator('.pm-block[data-block="hidden"] .pm-output__error')).toHaveCount(0)
})
