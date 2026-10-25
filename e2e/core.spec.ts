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
