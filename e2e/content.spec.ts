import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'
import { build, serve, writeDeck } from './fixtures/plugins/decks.ts'

test.describe.configure({ mode: 'default' })
const content = useFixture('content')

const media = (element: Locator) => element.evaluate((el: HTMLMediaElement) => el.duration)
const loaded = (image: Locator) => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)

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
