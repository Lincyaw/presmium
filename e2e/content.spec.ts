import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'
import { build, serve, writeDeck } from './fixtures/plugins/decks.ts'

test.describe.configure({ mode: 'default' })
const content = useFixture('content')

async function open(page: Page, alias: string) {
  await page.goto(`${content().slides}/${alias}`)
  const slide = page.locator(`.slidev-layout.pm-${alias}`)
  await expect(slide).toBeVisible()
  return slide
}

const media = (element: Locator) => element.evaluate((el: HTMLMediaElement) => el.duration)
const loaded = (image: Locator) => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)

test('formulas, Mermaid and PlantUML render as math, an svg diagram and a local diagram image', async ({ page }) => {
  const slide = await open(page, 'content-diagrams')
  await expect(slide.locator('.katex annotation').first()).toHaveText('e^{i\\pi} + 1 = 0')
  await expect(slide.locator('.katex-display annotation')).toContainText('\\frac{n(n+1)}{2}')
  await expect(slide.locator('.mermaid svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')

  const diagram = (await open(page, 'content-sequence')).getByRole('img', { name: 'PlantUML 图' })
  await expect.poll(() => loaded(diagram)).toBeGreaterThan(0)
  expect(await diagram.getAttribute('src')).not.toMatch(/^https?:/)
})

test('media directives give video, audio and an animated image from the build, with controls and sizes', async ({ page }) => {
  const slide = await open(page, 'content-media')
  const video = slide.locator('figure.pm-media video')
  await expect(video).toHaveAttribute('controls', '')
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await video.evaluate((el: HTMLVideoElement) => el.play())
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0)
  await expect(slide.locator('figure.pm-media:has(video) figcaption')).toContainText('controls 显示播放控制')

  const audio = slide.locator('figure.pm-media audio')
  await expect(audio).toHaveAttribute('controls', '')
  await expect.poll(() => media(audio)).toBeCloseTo(2, 0)

  const image = slide.getByRole('img', { name: '旋转的加载动画' })
  await expect(image).toHaveCount(1)
  await expect(image).toHaveAttribute('width', '96')
  await expect.poll(() => loaded(image)).toBe(96)
  expect(await image.getAttribute('src')).toMatch(/\.gif$/)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const still = (await open(page, 'content-media')).getByRole('img', { name: '旋转的加载动画' })
  await expect(still).toHaveCount(1)
  await expect.poll(() => loaded(still)).toBe(96)
  expect(await still.getAttribute('src')).not.toMatch(/\.gif$/)
})

test('an embedded web component keeps its own interactive state', async ({ page }) => {
  const slide = await open(page, 'content-element')
  const counters = slide.locator('presmium-demo-counter')
  const [first, second] = [counters.nth(0), counters.nth(1)]
  await expect(first.locator('output')).toHaveText('0')
  await expect(second.locator('output')).toHaveText('10')

  await first.locator('button').click()
  await first.locator('button').click()
  await expect(first.locator('output')).toHaveText('2')
  await expect(second.locator('output')).toHaveText('10')
  await expect(slide).toBeVisible()
})

test('the web form renders the same content: math, diagrams, mindmap, media and the web component', async ({ page }) => {
  await page.goto(`${content().web}/content.html`)
  const section = (id: string) => page.locator(`.pm-section[data-section="${id}"]`)
  await expect(section('content-diagrams').locator('.katex').first()).toBeVisible()
  await expect(section('content-diagrams').locator('svg[aria-roledescription="flowchart-v2"]')).toContainText('VitePress')
  await expect.poll(() => loaded(section('content-sequence').getByRole('img', { name: 'PlantUML 图' }))).toBeGreaterThan(0)
  await expect(section('content-mindmap').locator('svg.pm-markmap .markmap-node')).toHaveCount(13)

  const counter = section('content-element').locator('presmium-demo-counter').first()
  await counter.locator('button').click()
  await expect(counter.locator('output')).toHaveText('1')

  const video = section('content-media').locator('figure.pm-media video')
  await expect(video).toHaveAttribute('src', /^\/web\/media\/[0-9a-f]{8}-/)
  expect((await page.request.get(new URL((await video.getAttribute('src'))!, page.url()).href)).status()).toBe(200)
  await expect(video).toHaveAttribute('width', '280')
  await expect.poll(() => media(video)).toBeCloseTo(3, 0)
  await expect.poll(() => media(section('content-media').locator('figure.pm-media audio'))).toBeCloseTo(2, 0)
  const image = section('content-media').getByRole('img', { name: '旋转的加载动画' })
  await expect(image).toHaveCount(1)
  await expect.poll(() => loaded(image)).toBe(96)
})

test('the mindmap folds and unfolds a node from the keyboard', async ({ page }) => {
  await page.goto(`${content().web}/content.html`)
  const map = page.locator('.pm-section[data-section="content-mindmap"] svg.pm-markmap')
  await expect(map.locator('.markmap-node')).toHaveCount(13)
  const toggle = map.getByRole('button', { name: '折叠或展开：公式' })
  await expect(toggle).toHaveAttribute('tabindex', '0')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(map.locator('.markmap-node')).toHaveCount(11)
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(map.locator('.markmap-node')).toHaveCount(13)
})

async function expectCaptionedVideo(page: Page, video: Locator) {
  const tracks = video.locator('track')
  await expect(tracks).toHaveCount(2)
  await expect(tracks.nth(0)).toHaveAttribute('srclang', 'en')
  await expect(tracks.nth(0)).toHaveAttribute('label', '英语')
  await expect(tracks.nth(0)).toHaveAttribute('default', '')
  await expect(tracks.nth(1)).toHaveAttribute('srclang', 'zh-CN')
  await expect(tracks.nth(1)).not.toHaveAttribute('default')
  const files = [await video.getAttribute('poster'), ...await tracks.evaluateAll(list => list.map(track => track.getAttribute('src')))]
  expect(files).toEqual([expect.stringMatching(/poster\.png$/), expect.stringMatching(/loop\.en\.vtt$/), expect.stringMatching(/loop\.zh\.vtt$/)])
  for (const file of files) expect((await page.request.get(new URL(file!, page.url()).href)).status()).toBe(200)
  await tracks.evaluateAll((list: HTMLTrackElement[]) => list.forEach(element => element.track.mode = 'hidden'))
  await expect.poll(() => tracks.evaluateAll((list: HTMLTrackElement[]) => list.map(element => [...element.track.cues ?? []].map(cue => (cue as VTTCue).text)))).toEqual([
    ['One turn of the agent loop.'],
    ['智能体环路的一轮。'],
  ])
}

test('a video with a poster and captions in two languages has its poster and two tracks in both forms', async ({ page }) => {
  await page.goto(`${content().web}/cards.html`)
  const video = page.locator('.pm-section[data-section="content-captions"] figure.pm-media video')
  await expect(video).toHaveAttribute('poster', /^\/web\/media\/[0-9a-f]{8}-poster\.png$/)
  await expectCaptionedVideo(page, video)

  const slide = await open(page, 'content-captions')
  await expectCaptionedVideo(page, slide.locator('figure.pm-media video'))
})

test('a grid of three cards has three columns on a desktop and one on a phone; a card\'s button is a link', async ({ page }) => {
  const cards = page.locator('.pm-section[data-section="content-cards"] .pm-grid > .pm-card')
  const columns = async () => new Set(await cards.evaluateAll(list => list.map(card => Math.round(card.getBoundingClientRect().left)))).size
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${content().web}/cards.html`)
  await expect(cards).toHaveCount(3)
  await expect.poll(columns).toBe(3)
  await page.setViewportSize({ width: 375, height: 800 })
  await expect.poll(columns).toBe(1)

  await expect(cards.nth(0).locator('.pm-card__title a')).toHaveAttribute('href', 'https://example.com/week-01/')
  const button = cards.nth(0).locator('.pm-card__footer a.pm-button')
  await expect(button).toHaveText('进入讲义')
  await expect(button).toHaveAttribute('href', /#content-tabs$/)
  await expect(cards.nth(2).locator('.pm-card__header')).toHaveText('页眉')
})

test('choosing a tab chooses the tab with the same :sync: key in the other tab set', async ({ page }) => {
  await page.goto(`${content().web}/cards.html`)
  const sets = page.locator('.pm-section[data-section="content-tabs"] .pm-tabs')
  await expect(sets).toHaveCount(2)
  const [first, second] = [sets.nth(0), sets.nth(1)]
  await expect(second.getByRole('tabpanel')).toHaveText('安装：pip install presmium')
  await first.getByRole('tab', { name: 'JavaScript' }).click()
  await expect(first.getByRole('tab', { name: 'JavaScript' })).toHaveAttribute('aria-selected', 'true')
  await expect(first.getByRole('tabpanel')).toHaveText('用 console.log 输出。')
  await expect(second.getByRole('tab', { name: 'JavaScript' })).toHaveAttribute('aria-selected', 'true')
  await expect(second.getByRole('tabpanel')).toHaveText('安装：npm install presmium')
})

test('the slides show the cards in their grid, and a tab set as its tabs one after another', async ({ page }) => {
  const slide = await open(page, 'content-cards')
  const cards = slide.locator('.pm-grid > .pm-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(1)).toBeVisible()
  await expect(cards.nth(1)).toContainText('第 2 周：上下文')
  const tops = await cards.evaluateAll(list => list.map(card => Math.round(card.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)

  const tabs = (await open(page, 'content-tabs')).locator('.pm-tabs').first()
  await expect(tabs.locator('.pm-tabs__title')).toHaveText(['Python', 'JavaScript'])
  await expect(tabs).toContainText('用 console.log 输出。')
})

test.describe('online media', () => {
  test.describe.configure({ timeout: 120_000 })
  let deck: string
  let site: Awaited<ReturnType<typeof serve>>

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    deck = writeDeck('online', `
title: Online media
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-content'
renderers:
  web: {}
  slides:
    theme: default
  notebook: {}
`, ['online.md'])
    await build(deck, 'web,slides,notebook')
    site = await serve(join(deck, 'dist'), '/slides/')
  })

  test.afterAll(async () => {
    await site?.close()
    if (deck) rmSync(deck, { recursive: true, force: true })
  })
})
