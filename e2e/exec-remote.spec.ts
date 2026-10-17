// Remote environments (WP-76, P-105, P-107): e2e/fixtures/exec-remote runs its code in a Jupyter
// Server started from templates/env/compose/compose.yaml. Under `presmium dev`, `auth: proxy` code
// runs in the compose kernels through the server's proxy, which adds the token the page never sees;
// sessions are the page's, so two learners do not share variables; `{terminal}` opens a shell there.
// In a static build, `auth: prompt` code runs once the learner pastes the token, which stays in the
// tab's sessionStorage. Leaving the page shuts its terminals down. Needs Docker; skipped without it.
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { buildFixture, deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'
import { dockerCompose, startHub, startJupyter } from './fixtures/exec-remote/jupyter.ts'
import type { Hub, Jupyter } from './fixtures/exec-remote/jupyter.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/exec-remote')
/** The plugin, which the demo does not depend on. */
const LINK = { '@presmium/slidev-addon-exec-jupyter': 'packages/addon-exec-jupyter' }
/** The compose environment's port, in WP-89e's range (the fixture's web dev server is on 5339). */
const JUPYTER_PORT = 5338
/** The JupyterHub's port, which e2e/fixtures/exec-remote/hub/lecture.md names. */
const HUB_PORT = 5337
const OUTPUT = '远端内核 CPython 42\n'
/** A kernel takes a moment to start. */
const KERNEL = { timeout: 60_000 }

test.describe.configure({ mode: 'serial' })
test.skip(!dockerCompose, 'needs Docker with docker compose (templates/env/compose); start the Docker daemon to run it')

let jupyter: Jupyter | undefined
test.beforeAll(() => {
  test.setTimeout(600_000)
  jupyter = startJupyter('wp89e-exec-remote', JUPYTER_PORT)
})
test.afterAll(() => {
  jupyter?.stop()
})

const block = (page: Page, id: string) => page.locator(`.pm-block[data-block="${id}"]`)

/** Runs a code block; resolves once it shows the output of a live run. */
async function run(code: Locator): Promise<void> {
  await code.locator('.pm-code-block__run button').first().click()
  await expect(code.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', KERNEL)
}

test.describe('presmium dev, auth: proxy', () => {
  let dir: string
  let dev: DevServer
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = deckDir('exec-remote-dev', LINK)
    cpSync(join(FIXTURE, 'lecture.md'), join(dir, 'lecture.md'))
    dev = await startDev(dir, 'web', { PRESMIUM_ENV_LAB_URL: jupyter!.url, PRESMIUM_ENV_LAB_TOKEN: jupyter!.token })
  })
  test.afterAll(async () => {
    await dev?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('code runs in the compose kernel through the server\'s proxy, with the output recorded at compile time; neither the page nor its requests hold the token', async ({ page }) => {
    test.setTimeout(240_000)
    const seen: string[] = []
    page.on('request', request => seen.push(`${request.url()} ${JSON.stringify(request.headers())}`))
    page.on('websocket', socket => seen.push(socket.url()))
    const where = block(page, 'where')
    await openDevPage(page, dev.url, where.locator('.pm-code-block__run button'))
    // The dev server compiled the block in the same kernels.
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'recorded')
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)

    // The dev server pre-bundled the Jupyter client, so its first import does not reload the page.
    await run(where)
    await expect(where.locator('.pm-output')).toHaveAttribute('data-executor', 'presmium.env.lab')
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)

    expect(seen.some(entry => entry.includes('/__presmium/presmium.execJupyter/env/lab/api/kernels'))).toBe(true)
    expect(seen.filter(entry => entry.includes(jupyter!.token))).toEqual([])
    expect(await page.content()).not.toContain(jupyter!.token)
  })

  test('a session is the page\'s: another learner\'s page does not see its variables', async ({ page, browser }) => {
    test.setTimeout(240_000)
    await openDevPage(page, dev.url, block(page, 'use').locator('.pm-code-block__run button').first())
    await run(block(page, 'define'))
    await expect(block(page, 'define').locator('.pm-output__stdout')).toHaveText('定义了 x\n')
    await run(block(page, 'use'))
    await expect(block(page, 'use').locator('.pm-output__stdout')).toHaveText('42\n')

    const other = await browser.newContext()
    try {
      const learner = await other.newPage()
      await openDevPage(learner, dev.url, block(learner, 'use').locator('.pm-code-block__run button').first())
      await run(block(learner, 'use'))
      await expect(block(learner, 'use').locator('.pm-output__error')).toContainText('NameError')
    } finally {
      await other.close()
    }
  })

  test('{terminal} opens a shell of the environment, which leaving the page shuts down (F-68)', async ({ page }) => {
    test.setTimeout(180_000)
    const terminals = async () => {
      const response = await fetch(`${jupyter!.url}api/terminals`, { headers: { Authorization: `token ${jupyter!.token}` } })
      return (await response.json() as { name: string }[]).map(terminal => terminal.name)
    }
    const before = await terminals()
    const terminal = page.locator('.pm-terminal[data-env="lab"]')
    await openDevPage(page, dev.url, terminal.locator('.pm-terminal__open'))
    await terminal.locator('.pm-terminal__open').click()
    await expect(terminal).toHaveAttribute('data-state', 'open', KERNEL)
    await expect(terminal.locator('.xterm-rows')).toContainText('$', KERNEL)
    await terminal.locator('.xterm').click()
    await page.keyboard.type('echo presmium-$((6*7))')
    await page.keyboard.press('Enter')
    await expect(terminal.locator('.xterm-rows')).toContainText('presmium-42')

    // The page goes away without unmounting its components (pagehide): the terminal goes with it.
    const opened = (await terminals()).filter(name => !before.includes(name))
    expect(opened).toHaveLength(1)
    await page.goto('about:blank')
    await expect.poll(terminals, { timeout: 20_000 }).not.toContain(opened[0])
  })
})

/** Every file under `dir`. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

test.describe('static output, auth: prompt', () => {
  let deck: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(600_000)
    // The build records the output with the operator's pair; the page then asks the learner for a token.
    const saved = { url: process.env.PRESMIUM_ENV_LAB_URL, token: process.env.PRESMIUM_ENV_LAB_TOKEN }
    process.env.PRESMIUM_ENV_LAB_URL = jupyter!.url
    process.env.PRESMIUM_ENV_LAB_TOKEN = jupyter!.token
    try {
      deck = await buildFixture('exec-remote', {
        to: 'web,slides',
        link: LINK,
        edit: (dir) => {
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

  test('code runs once the learner pastes the token, which stays in this tab\'s sessionStorage and not in the output; the slides\' terminal uses it', async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto(`${deck.web}/?section=remote`)
    const where = block(page, 'where')
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)
    await expect(where.locator('.pm-code-block__run button').first()).toBeEnabled()
    await where.locator('.pm-code-block__run button').first().click()
    const dialog = page.getByRole('dialog', { name: '环境 lab 的令牌' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('令牌').fill(jupyter!.token)
    await dialog.getByRole('button', { name: '连接' }).click()
    await expect(where.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', KERNEL)
    await expect(where.locator('.pm-output__stdout')).toHaveText(OUTPUT)

    expect(await page.evaluate(() => sessionStorage.getItem('presmium.execJupyter.token:lab'))).toBe(jupyter!.token)
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(jupyter!.token)
    const leaking = files(join(deck.dir, 'dist')).filter(file => readFileSync(file).includes(jupyter!.token))
    expect(leaking).toEqual([])

    // The slides of the same site, in the same tab, find the token there: their terminal opens without asking.
    await page.goto(`${deck.slides}/${deck.slide('shell')}`)
    const terminal = page.locator('.pm-terminal[data-env="lab"]')
    await terminal.locator('.pm-terminal__open').click()
    await expect(terminal).toHaveAttribute('data-state', 'open', KERNEL)
    await expect(terminal.locator('.xterm-rows')).toContainText('$', KERNEL)
    await terminal.locator('.xterm').click()
    await page.keyboard.type('echo presmium-$((6*7))')
    await page.keyboard.press('Enter')
    await expect(terminal.locator('.xterm-rows')).toContainText('presmium-42')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('JupyterHub, auth: prompt with {user} (P-105, F-71)', () => {
  let hub: Hub | undefined
  let deck: FixtureDeck
  test.beforeAll(async () => {
    test.setTimeout(900_000)
    hub = await startHub('wp89e-exec-remote-hub', HUB_PORT)
    deck = await buildFixture('exec-remote/hub', { to: 'web', link: LINK })
  })
  test.afterAll(async () => {
    await deck?.close()
    hub?.stop()
  })

  test('the learner pastes a token of the hub; the page finds their server, /user/<name>/, and runs the code there', async ({ page }) => {
    test.setTimeout(180_000)
    const kernels: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/kernels')) kernels.push(new URL(request.url()).pathname)
    })
    await page.goto(`${deck.web}/?section=mine`)
    const whose = block(page, 'whose')
    await expect(whose.locator('.pm-code-block__run button').first()).toBeEnabled()
    await whose.locator('.pm-code-block__run button').first().click()
    const dialog = page.getByRole('dialog', { name: '环境 hub 的令牌' })
    await dialog.getByLabel('令牌').fill(hub!.token)
    await dialog.getByRole('button', { name: '连接' }).click()
    await expect(whose.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', KERNEL)
    await expect(whose.locator('.pm-output__stdout')).toHaveText(`服务器属于 ${hub!.user}\n`)
    expect(kernels.length).toBeGreaterThan(0)
    expect(kernels.every(path => path.startsWith(`/user/${hub!.user}/api/kernels`))).toBe(true)
  })
})
