import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { buildFixture, deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'
import { localPython, startLocalJupyter } from '../packages/addon-exec-jupyter/test/local-jupyter.ts'
import type { LocalJupyter } from '../packages/addon-exec-jupyter/test/local-jupyter.ts'

test.describe.configure({ mode: 'default' })
test.skip(!localPython, 'set PRESMIUM_TEST_JUPYTER_PYTHON to a Python with jupyter_server and ipykernel installed')

const LINK = { '@lincyaw/addon-exec-jupyter': 'packages/addon-exec-jupyter' }
const OUTPUT = 'Jupyter CPython 42\n'
const TOKEN_KEY = 'presmium.execJupyter.token:lab'
const KERNEL = { timeout: 60_000 }
const block = (page: Page, id: string) => page.locator(`.pm-block[data-block="${id}"]`)

let jupyter: LocalJupyter | undefined
test.beforeAll(async () => {
  jupyter = await startLocalJupyter(localPython!, { cors: true })
})
test.afterAll(async () => {
  await jupyter?.stop()
})

async function run(code: Locator): Promise<void> {
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', KERNEL)
}

async function terminalEcho(page: Page): Promise<void> {
  await page.bringToFront()
  const terminal = page.locator('.pm-terminal[data-env="lab"]').filter({ visible: true })
  await terminal.locator('.pm-terminal__open').click()
  await expect(terminal).toHaveAttribute('data-state', 'open', KERNEL)
  await expect(terminal.locator('.xterm-rows')).toContainText(/[$#]/, KERNEL)
  await terminal.locator('.xterm').click()
  await page.keyboard.type('echo presmium-$((6*7))')
  await page.keyboard.press('Enter')
  await expect(terminal.locator('.xterm-rows')).toContainText('presmium-42', KERNEL)
}

async function terminalResizeAndReconnect(page: Page): Promise<void> {
  const terminal = page.locator('.pm-terminal[data-env="lab"]')
  const rows = terminal.locator('.xterm-rows')
  const size = async (marker: string): Promise<number[]> => {
    await terminal.locator('.xterm').click()
    await page.keyboard.type(`printf '${marker}_%s\\n' "$(stty size)"`)
    await page.keyboard.press('Enter')
    const pattern = new RegExp(`${marker}_(\\d+) (\\d+)`)
    await expect(rows).toContainText(pattern, KERNEL)
    return pattern.exec(await rows.innerText())!.slice(1).map(Number)
  }
  const before = await size('BEFORE')
  expect(before[0]).toBe(8)
  const width = await terminal.locator('.xterm-screen').evaluate(element => element.getBoundingClientRect().width)
  await page.setViewportSize({ width: 480, height: 900 })
  await expect.poll(() => terminal.locator('.xterm-screen').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(width)
  const after = await size('AFTER')
  expect(after[0]).toBe(8)
  expect(after[1]).toBeLessThan(before[1]!)
  await page.keyboard.type('exit')
  await page.keyboard.press('Enter')
  await expect(terminal).toHaveAttribute('data-state', 'closed', { timeout: 10_000 })
  await expect(terminal.getByRole('button', { name: '重新打开' })).toBeVisible()
  await terminalEcho(page)
}

test.describe('proxy browser execution', () => {
  let dir: string | undefined
  let dev: DevServer | undefined
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    dir = deckDir('exec-remote-local', LINK)
    cpSync(fileURLToPath(new URL('./fixtures/exec-remote-local/lecture.md', import.meta.url)), join(dir, 'lecture.md'))
    dev = await startDev(dir, 'web', { PRESMIUM_ENV_LAB_URL: jupyter!.url, PRESMIUM_ENV_LAB_TOKEN: jupyter!.token })
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('recorded and live output agree, rich HTML is sanitized and another browser context has an isolated session', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const requests: string[] = []
    page.on('request', request => requests.push(`${request.url()} ${JSON.stringify(request.headers())}`))
    page.on('websocket', socket => requests.push(socket.url()))
    const where = block(page, 'where')
    await openDevPage(page, dev!.url, where.locator('.pm-code-block__run button').first())
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)
    await run(where)
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)

    await run(block(page, 'define'))
    await run(block(page, 'use'))
    await expect(block(page, 'use').locator('.pm-output__stdout')).toHaveText('42\n')
    const other = await browser.newContext()
    try {
      const learner = await other.newPage()
      await learner.goto(dev!.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await run(block(learner, 'use'))
      await expect(block(learner, 'use').locator('.pm-output__error')).toContainText('NameError')
    } finally {
      await other.close()
    }
    await block(page, 'use').locator('.pm-code-block__reset').click()
    await run(block(page, 'use'))
    await expect(block(page, 'use').locator('.pm-output__error')).toContainText('NameError')

    const rich = block(page, 'display')
    await run(rich)
    await expect(rich.locator('#jupyter-safe')).toHaveText('rich-42')
    await expect(rich.locator('.pm-output__html script, .pm-output__html [onerror]')).toHaveCount(0)
    expect(await page.evaluate(() => (window as Window & { __jupyterUnsafe?: number }).__jupyterUnsafe)).toBeUndefined()
    expect(requests.some(value => value.includes('/__presmium/presmium.execJupyter/env/lab/api/kernels'))).toBe(true)
    expect(requests.join('\n').includes(jupyter!.token)).toBe(false)
    expect((await page.content()).includes(jupyter!.token)).toBe(false)
  })
})

function artifactFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name)
    return statSync(file).isDirectory() ? artifactFiles(file) : [file]
  })
}

test.describe('static auth: prompt', () => {
  let deck: FixtureDeck | undefined
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const saved = { url: process.env.PRESMIUM_ENV_LAB_URL, token: process.env.PRESMIUM_ENV_LAB_TOKEN }
    process.env.PRESMIUM_ENV_LAB_URL = jupyter!.url
    process.env.PRESMIUM_ENV_LAB_TOKEN = jupyter!.token
    try {
      deck = await buildFixture('exec-remote-local', {
        to: 'web,slides', link: LINK, bases: true,
        edit: dir => {
          const file = join(dir, 'lecture.md')
          writeFileSync(file, readFileSync(file, 'utf8').replace('auth: proxy', `auth: prompt, url: '${jupyter!.url}'`))
        },
      })
    } finally {
      for (const [name, value] of [['PRESMIUM_ENV_LAB_URL', saved.url], ['PRESMIUM_ENV_LAB_TOKEN', saved.token]] as const) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })
  test.afterAll(async () => {
    await deck?.close()
  })

  test('cancel and wrong-token retry work; a valid token stays in sessionStorage, with live webpage and slide execution and terminals', async ({ page, browser }) => {
    test.setTimeout(240_000)
    const seen: { url: string, token: boolean }[] = []
    page.on('request', request => seen.push({ url: request.url(), token: `${request.url()} ${JSON.stringify(request.headers())}`.includes(jupyter!.token) }))
    page.on('websocket', socket => seen.push({ url: socket.url(), token: socket.url().includes(jupyter!.token) }))
    await page.goto(deck!.web, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    const where = block(page, 'where')
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)
    await where.locator('.pm-code-block__run button').first().click()
    const dialog = page.getByRole('dialog', { name: '环境 lab 的令牌' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(where.locator('.pm-output__note')).toContainText('没有输入环境 lab 的令牌')
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
    expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull()

    await where.locator('.pm-code-block__run button').first().click()
    await dialog.getByLabel('令牌').fill('incorrect-test-token')
    await dialog.getByRole('button', { name: '连接' }).click()
    // Jupyter's unauthenticated error response may omit CORS headers, so a
    // browser cannot always distinguish a rejected token from a network error.
    await expect(where.locator('.pm-output__note')).toContainText(/拒绝了令牌|无法连接环境 lab/, KERNEL)
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
    expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull()

    await where.locator('.pm-code-block__run button').first().click()
    await dialog.getByLabel('令牌').fill(jupyter!.token)
    await dialog.getByRole('button', { name: '连接' }).click()
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', KERNEL)
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)
    expect((await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)) === jupyter!.token).toBe(true)
    expect((await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes(jupyter!.token)).toBe(false)
    await terminalEcho(page)

    await page.goto(`${deck!.slides}/${deck!.slide('remote')}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    const slide = page.locator('.slidev-page').filter({ visible: true })
    await expect(slide.locator('.pm-run-recorded')).toHaveText('预录输出')
    await slide.getByRole('button', { name: 'Run code' }).click()
    await expect(slide.locator('.pm-run-recorded')).toHaveCount(0, KERNEL)
    await expect(slide.locator('.slidev-runner-output .output-line')).toHaveText(['Jupyter CPython 42'])
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.goto(`${deck!.slides}/${deck!.slide('shell')}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await terminalEcho(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const tokenRequests = seen.filter(request => request.token)
    expect(tokenRequests.length).toBeGreaterThan(0)
    expect(tokenRequests.every(request => new URL(request.url).host === new URL(jupyter!.url).host)).toBe(true)
    expect(artifactFiles(join(deck!.dir, 'dist')).filter(file => readFileSync(file).includes(jupyter!.token))).toEqual([])
    const separate = await browser.newContext()
    try {
      const fresh = await separate.newPage()
      await fresh.goto(deck!.web, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      expect(await fresh.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull()
    } finally {
      await separate.close()
    }
  })
})

test.describe('static auth: none', () => {
  let open: LocalJupyter | undefined
  let deck: FixtureDeck | undefined
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    // A deliberately unauthenticated loopback service must also allow cross-site
    // API writes. This is a test deployment configuration, not a product default.
    open = await startLocalJupyter(localPython!, { cors: true, noAuth: true })
    deck = await buildFixture('exec-remote-local', {
      to: 'web', link: LINK,
      edit: dir => {
        const file = join(dir, 'lecture.md')
        writeFileSync(file, readFileSync(file, 'utf8').replace('auth: proxy', `auth: none, url: '${open!.url}'`))
      },
    })
  })
  test.afterAll(async () => {
    await deck?.close()
    await open?.stop()
  })

  test('a configured unauthenticated service runs code without a token; its terminal resizes and reopens after exit', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(deck!.web, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await expect(block(page, 'where').locator('.pm-output__stdout')).toHaveText(OUTPUT)
    await run(block(page, 'where'))
    await expect(block(page, 'where').locator('.pm-output__stdout')).toHaveText(OUTPUT)
    await terminalEcho(page)
    await terminalResizeAndReconnect(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull()
  })
})
