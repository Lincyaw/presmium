import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'
import { fixtureDeck } from './fixtures/core/deck.ts'
import { deckDir, openDevPage, startDev } from './fixtures/deck.ts'
import type { DevServer, FixtureDeck } from './fixtures/deck.ts'

declare global {
  interface Window {
    motionFrames?: number[]
    channelNames?: string[]
  }
}

async function openPanels(page: Page) {
  const panels = page.locator('.pm-presenter-panels')
  await panels.locator('summary').click()
  return panels
}

async function recordChannels(context: BrowserContext) {
  await context.addInitScript(() => {
    const names: string[] = []
    window.channelNames = names
    const Native = BroadcastChannel
    window.BroadcastChannel = class extends Native {
      constructor(name: string) {
        super(name)
        names.push(name)
      }
    }
  })
}

const FRAMES = 30

async function animationsAfter(page: Page, key: string): Promise<number> {
  await page.evaluate((frames) => {
    const counts: number[] = []
    window.motionFrames = counts
    addEventListener('keydown', () => {
      const sample = () => {
        counts.push(document.getAnimations().filter(animation => animation.playState === 'running').length)
        if (counts.length < frames) requestAnimationFrame(sample)
      }
      sample()
    }, { once: true, capture: true })
  }, FRAMES)
  await page.keyboard.press(key)
  await page.waitForFunction(frames => (window.motionFrames?.length ?? 0) >= frames, FRAMES)
  return Math.max(...await page.evaluate(() => window.motionFrames!))
}

const DEV_DECK = `---
title: 开发服务器
plugins:
  - '@lincyaw/addon-core'
renderers:
  slides: {}
---

# 开发服务器

(first)=
## 第一页

:::{slide}
编辑前的内容
:::
`

interface DevDeck {
  file: string
  serve(): Promise<string>
}

const devTest = test.extend<{ devDeck: DevDeck }>({
  devDeck: async ({}, use) => {
    const dir = deckDir('slides')
    writeFileSync(join(dir, 'lecture.md'), DEV_DECK)
    let server: DevServer | undefined
    await use({
      file: join(dir, 'lecture.md'),
      async serve() {
        server = await startDev(dir, 'slides')
        return server.url
      },
    })
    await server?.stop()
    rmSync(dir, { recursive: true, force: true })
  },
})

devTest('presmium dev serves the slides with Slidev and updates them when the source changes, without a reload', async ({ page, devDeck }) => {
  devTest.setTimeout(180_000)
  const url = await devDeck.serve()
  const slide = page.locator('.slidev-page-2')
  await openDevPage(page, `${url}2`, slide.filter({ hasText: '编辑前的内容' }))
  await page.evaluate(() => {
    (window as { marker?: boolean }).marker = true
  })

  writeFileSync(devDeck.file, readFileSync(devDeck.file, 'utf8').replace('编辑前的内容', '编辑后的内容'))
  await expect(slide).toContainText('编辑后的内容')
  expect(await page.evaluate(() => (window as { marker?: boolean }).marker)).toBe(true)
})

test.describe('the fixture deck in the slides form', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let deck: FixtureDeck
  const slide = (id: string, query = '') => `${deck.url}/slides/${deck.slide(id)}${query}`
  const presenter = (id: string) => `${deck.url}/slides/presenter/${deck.slide(id)}`
  const shown = (page: Page, id: string) => page.locator(`.slidev-page-${deck.slide(id)}`)

  async function open(page: Page, url: string) {
    await page.goto(url)
    await expect.poll(() => page.evaluate(() => window.fixtureLang)).toBeTruthy()
  }

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = await fixtureDeck()
  })
  test.afterAll(() => deck?.close())

  test('jumping to step 3 renders the same DOM as stepping there from step 0', async ({ page }) => {
    const layout = page.locator('.slidev-layout.fx-steps').first()
    await open(page, slide('steps', '?clicks=3'))
    await expect(layout.locator('.demo-stepper')).toHaveAttribute('data-step', '3')
    const expected = await layout.innerHTML()

    await open(page, slide('steps'))
    const stepper = layout.locator('.demo-stepper')
    await expect(stepper).toHaveAttribute('data-step', '0')
    for (const step of ['1', '2', '3']) {
      await page.keyboard.press('ArrowRight')
      await expect(stepper).toHaveAttribute('data-step', step)
    }
    expect(await layout.innerHTML()).toBe(expected)
  })

  test('a component counts its steps from its block: at its first internal step it looks the same wherever the block appears', async ({ page }) => {
    const stepper = async (url: string, layout: string) => {
      await open(page, url)
      const stepper = page.locator(`.slidev-layout.${layout} .demo-stepper`).first()
      await expect(stepper).toHaveAttribute('data-step', '1')
      await expect(stepper.locator('li[data-status="active"]')).toHaveText('Parse')
      return (await stepper.innerHTML()).replace(/ data-slidev-clicks-(start|end)="\d+"/g, '')
    }
    const early = await stepper(slide('steps', '?clicks=1'), 'fx-steps')
    const late = await stepper(slide('late-steps', '?clicks=3'), 'fx-late-steps')
    expect(late).toBe(early)

    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('.slidev-layout.fx-late-steps .demo-stepper').first()).toHaveAttribute('data-step', '0')
  })

  test('narration becomes the speaker notes, highlighted at the step it belongs to', async ({ page }) => {
    await open(page, presenter('steps'))
    const notes = page.locator('.slidev-note')
    const intro = notes.locator('p', { hasText: 'Here a component follows the steps' })
    const first = notes.locator('p', { hasText: 'The first step highlights' })
    await expect(intro).not.toHaveClass(/slidev-note-fade/)
    await expect(first).toHaveClass(/slidev-note-fade/)

    await page.keyboard.press('ArrowRight')
    await expect(first).not.toHaveClass(/slidev-note-fade/)
    await expect(intro).toHaveClass(/slidev-note-fade/)
  })

  test('the slide shows the visual blocks only: no narration, no content limited to other renderers', async ({ page }) => {
    await open(page, slide('steps'))
    const steps = shown(page, 'steps')
    await expect(steps).toContainText('jumping to a step looks the same')
    await expect(steps).not.toContainText('Here a component follows the steps')
    await expect(steps).not.toContainText('A note for the web form only')
  })

  test('a consumer plugin gets the provider service; a plugin missing a required service is disabled', async ({ page }) => {
    await open(page, slide('services'))
    await expect(shown(page, 'services').locator('.demo-greeting')).toHaveText('fixture.host.consumer got a greeting from fixture.host.provider')

    await open(page, presenter('services'))
    const report = (await openPanels(page)).locator('.pm-start-report')
    await expect(report.locator('[data-plugin="fixture.host.provider"]')).toHaveAttribute('data-status', 'started')
    await expect(report.locator('[data-plugin="fixture.host.consumer"]')).toHaveAttribute('data-status', 'started')
    const orphan = report.locator('[data-plugin="fixture.host.orphan"]')
    await expect(orphan).toHaveAttribute('data-status', 'disabled')
    await expect(orphan).toContainText('fixture.host.missing')
  })

  test('with reduced motion the animated component shows its final state at once', async ({ page }) => {
    const animations = (bar: Locator) => bar.evaluate(el => el.getAnimations().length)
    const bar = shown(page, 'services').locator('.demo-animated__bar')

    await open(page, slide('services'))
    expect(await animations(bar)).toBe(1)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, slide('services'))
    expect(await animations(bar)).toBe(0)
    expect(await bar.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  })

  test('a throwing component shows a placeholder while the rest of the slide renders; the presenter panels list it', async ({ page }) => {
    await open(page, slide('lifecycle'))
    const lifecycle = shown(page, 'lifecycle')
    await expect(lifecycle.locator('[data-pm-error="FixtureBroken"]')).toContainText('fixture component failed on purpose')
    await expect(lifecycle.locator('h1')).toHaveText('Plugin lifecycle')
    await expect(lifecycle).toContainText('The rest of the slide renders.')
    await expect(page.locator('.pm-presenter-panels')).toHaveCount(0)

    await open(page, presenter('lifecycle'))
    const panels = await openPanels(page)
    await expect(panels.locator('.pm-component-errors [data-component="FixtureBroken"]')).toBeVisible()
  })

  test('a component that throws in its own setup shows a placeholder in both forms; the presenter lists its one error', async ({ page }) => {
    await open(page, slide('setup-error'))
    const own = shown(page, 'setup-error')
    await expect(own.locator('[data-pm-error="FixtureSetupThrows"]')).toContainText('fixture setup threw on purpose')
    await expect(own).toContainText('the rest of the slide renders')
    await open(page, presenter('setup-error'))
    const panels = await openPanels(page)
    await expect(panels.locator('.pm-component-errors li')).toHaveCount(1)
    await expect(panels.locator('.pm-component-errors [data-component="FixtureSetupThrows"]')).toBeVisible()

    await page.goto(`${deck.url}/web/errors.html`)
    const section = page.locator('.pm-section[data-section="setup-error"]')
    await expect(section.locator('[data-pm-error="FixtureSetupThrows"]')).toContainText('fixture setup threw on purpose')
    await expect(section).toContainText('the rest of the slide renders')
    await page.goto(`${deck.url}/web/errors.html?view=presenter&section=setup-error`)
    await expect(page.locator('.pm-presenter__slide [data-pm-error="FixtureSetupThrows"]')).toBeVisible()
    await page.locator('.pm-presenter-panels summary').click()
    await expect(page.locator('.pm-component-errors li')).toHaveCount(1)
  })

  test('a control on a slide shows the keyboard focus', async ({ page }) => {
    await open(page, slide('shared'))
    const button = shown(page, 'shared').getByRole('button', { name: 'Add one' })
    await expect(async () => {
      await page.keyboard.press('Tab')
      await expect(button).toBeFocused({ timeout: 100 })
    }).toPass({ timeout: 30_000, intervals: [0] })
    const focus = await button.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }))
    expect(focus.outline !== 'none' || focus.shadow !== 'none', JSON.stringify(focus)).toBe(true)
  })

  test('a section\'s {config} overrides a plugin option on its slide only', async ({ page }) => {
    const label = async (id: string) => {
      await page.goto(slide(id))
      return shown(page, id).locator('.fx-config')
    }
    await expect(await label('global')).toHaveText('global')
    await expect(await label('scoped')).toHaveText('section')
    await expect(await label('presmium-fixture-deck-with-a-title-too-long-for-a-phone')).toHaveText('cover')
  })

  test('an en-US deck sets <html lang> and speaks English, also in a Chinese browser: the start report, the button to the web form', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'zh-CN' })
    const page = await context.newPage()
    await open(page, slide('global'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(page.getByRole('link', { name: 'Read on the web' })).toHaveAttribute('href', new RegExp(`/web/\\?slide=${deck.slide('global')}$`))

    await open(page, presenter('lifecycle'))
    const panels = await openPanels(page)
    await expect(panels.locator('[data-panel="presmium.core.start-report"] h3')).toHaveText('Start report')
    await expect(panels.locator('[data-plugin="fixture.core.lifecycle"]')).toHaveText('fixture.core.lifecycle started')
    expect(await page.evaluate(() => window.fixtureLang)).toBe('en-US')
    await context.close()
  })

  test('a plugin for another kernel, a throwing setup and a dependency cycle are reported; plugins are disposed when the page goes away', async ({ page }) => {
    await open(page, presenter('lifecycle'))
    const report = (await openPanels(page)).locator('.pm-start-report')
    const plugin = (id: string) => report.locator(`[data-plugin="${id}"]`)
    await expect(plugin('fixture.core.future')).toHaveAttribute('data-status', 'disabled')
    await expect(plugin('fixture.core.future')).toContainText('kernel 1.0.0 does not satisfy "^9.0.0"')
    await expect(plugin('fixture.core.throws')).toHaveAttribute('data-status', 'failed')
    await expect(plugin('fixture.core.throws')).toContainText('fixture setup failed on purpose')
    for (const id of ['fixture.core.cycle-a', 'fixture.core.cycle-b']) {
      await expect(plugin(id)).toHaveAttribute('data-status', 'disabled')
      await expect(plugin(id)).toContainText('dependency cycle: fixture.core.cycle-a -> fixture.core.cycle-b -> fixture.core.cycle-a')
    }
    await expect(plugin('fixture.core.lifecycle')).toHaveAttribute('data-status', 'started')

    const disposals = () => page.evaluate(() => Number(localStorage.getItem('fixture.core.disposals') ?? 0))
    const before = await disposals()
    await page.reload()
    await expect.poll(disposals).toBe(before + 1)
  })

  test('windows of the deck share a plugin state, also with a window opened later', async ({ context }) => {
    const [a, b] = [await context.newPage(), await context.newPage()]
    for (const page of [a, b]) await open(page, slide('shared'))
    const count = (page: Page) => shown(page, 'shared').locator('.fx-shared__count')
    await expect(count(b)).toHaveText('0')
    await a.getByRole('button', { name: 'Add one' }).click()
    await a.getByRole('button', { name: 'Add one' }).click()
    await expect(count(a)).toHaveText('2')
    await expect(count(b)).toHaveText('2')

    const late = await context.newPage()
    await open(late, presenter('shared'))
    await expect(count(late).first()).toHaveText('2')
  })

  test('a deck with the same title under another base on the same origin does not share the state: the web form of this deck', async ({ context }) => {
    await recordChannels(context)
    const channel = (base: string) => `presmium.shared:Presmium Fixture Deck With A Title Too Long For A Phone:local:fixture.core.count @ ${base}`
    const channels = (page: Page) => page.evaluate(() => window.channelNames ?? [])
    const [a, b, web] = [await context.newPage(), await context.newPage(), await context.newPage()]
    for (const page of [a, b]) await open(page, slide('shared'))
    await web.goto(`${deck.url}/web/?view=present&section=shared`)
    await expect.poll(() => channels(a)).toContain(channel('/slides/'))
    await expect.poll(() => channels(web)).toContain(channel('/web/'))

    const count = (page: Page) => shown(page, 'shared').locator('.fx-shared__count')
    await a.getByRole('button', { name: 'Add one' }).click()
    await expect(count(b)).toHaveText('1')
    await expect(web.locator('.fx-shared__count').first()).toHaveText('0')
  })

  test('a remote plugin state goes to the other devices through the sync transports and comes back from them, in the order the changes happen', async ({ page }) => {
    await open(page, slide('shared'))
    const remote = shown(page, 'shared').locator('.fx-remote__count')
    const published = () => page.evaluate(() => window.fixtureDevice!.published)
    await shown(page, 'shared').getByRole('button', { name: 'Count on every device' }).click()
    await expect(remote).toHaveText('1')
    await expect.poll(async () => (await published()).at(-1)).toEqual({ value: 1, fromRemote: false })
    await page.evaluate(() => window.fixtureDevice!.receive({ value: 5 }))
    await expect(remote).toHaveText('5')

    const button = `.slidev-page-${deck.slide('shared')} .fx-remote button`
    await page.evaluate((button) => {
      document.querySelector<HTMLButtonElement>(button)!.click()
      window.fixtureDevice!.receive({ value: 9 })
    }, button)
    await expect(remote).toHaveText('9')
    await page.evaluate((button) => {
      window.fixtureDevice!.receive({ value: 20 })
      document.querySelector<HTMLButtonElement>(button)!.click()
    }, button)
    await expect(remote).toHaveText('21')
    expect((await published()).slice(-4)).toEqual([
      { value: 6, fromRemote: false },
      { value: 9, fromRemote: true },
      { value: 20, fromRemote: true },
      { value: 21, fromRemote: false },
    ])
  })

  test('with reduced motion, turning a page and revealing an item animate nothing', async ({ page }) => {
    const ready = async () => {
      await open(page, slide('lifecycle'))
      await expect(shown(page, 'lifecycle').locator('[data-pm-error="FixtureBroken"]')).toBeVisible()
      await page.waitForLoadState('networkidle')
    }
    await ready()
    expect(await animationsAfter(page, 'ArrowRight')).toBeGreaterThan(0)
    await expect(page).toHaveURL(new RegExp(`/slides/${deck.slide('motion')}$`))

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ready()
    expect(await animationsAfter(page, 'ArrowRight')).toBe(0)
    await expect(page).toHaveURL(new RegExp(`/slides/${deck.slide('motion')}$`))
    expect(await animationsAfter(page, 'ArrowRight')).toBe(0)
    await expect(shown(page, 'motion').locator('li').nth(1)).not.toHaveClass(/slidev-vclick-hidden/)
  })
})
