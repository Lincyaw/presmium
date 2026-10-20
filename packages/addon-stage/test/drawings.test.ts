import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { presmium, PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const DEMO = fileURLToPath(new URL('../../../e2e/fixtures/regression', import.meta.url))
const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV'))

const LECTURE = `---
title: Drawings
plugins:
  - '@lincyaw/slidev-addon-stage'
renderers:
  slides: {}
---

# Drawings

A slide to draw on.
`

mkdirSync(join(DEMO, '.presmium'), { recursive: true })
const deck = mkdtempSync(join(DEMO, '.presmium', 'stage-drawings-'))
writeFileSync(join(deck, '.gitignore'), '*\n')
writeFileSync(join(deck, 'lecture.md'), LECTURE)
const drawing = join(deck, '.presmium/drawings/1.svg')

let dev: ChildProcess | undefined
let browser: Browser | undefined
afterAll(async () => {
  await browser?.close()
  if (dev && dev.exitCode === null) {
    dev.kill('SIGTERM')
    await new Promise(done => dev!.once('exit', done))
  }
  rmSync(deck, { recursive: true, force: true })
})

function startDev(): Promise<string> {
  dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'slides'], { cwd: deck, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve, reject) => {
    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk
      const url = /^slides {2}(http\S+)$/m.exec(output)?.[1]
      if (url) resolve(url)
    }
    dev!.stdout!.on('data', read)
    dev!.stderr!.on('data', read)
    dev!.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
  })
}

async function openSlides(page: Page, url: string): Promise<void> {
  const heading = page.locator('.slidev-page h1', { hasText: 'Drawings' }).first()
  const deadline = Date.now() + 180_000
  for (let shown = 0; shown < 2;) {
    try {
      await page.goto(url)
      await heading.waitFor({ timeout: 30_000 })
      await page.waitForLoadState('networkidle')
      shown++
    } catch (error) {
      if (Date.now() > deadline) throw error
    }
  }
}

function filesOf(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).map(file => join(dir, file)).filter(file => statSync(file).isFile())
}

it('a drawing made in presmium dev is saved in the deck, ships with the build, and clearing removes it', async () => {
  const url = await startDev()
  browser = await chromium.launch()
  const page = await browser.newPage()
  await openSlides(page, url)

  await page.getByTitle('Show drawing toolbar').click()
  const box = (await page.locator('#slide-content').boundingBox())!
  const y = box.y + box.height * 0.7
  await page.mouse.move(box.x + box.width * 0.3, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.04), y - i * 6)
  await page.mouse.up()
  const stroke = () => (existsSync(drawing) ? /<path[^>]* d="([^"]{12})/.exec(readFileSync(drawing, 'utf8'))?.[1] : undefined)
  await expect.poll(stroke, { timeout: 15_000 }).toBeTruthy()
  expect(existsSync(join(deck, '.presmium/dev/slides/.presmium'))).toBe(false)
  const path = stroke()

  const built = await presmium(deck, ['build', '--to', 'slides'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const shipped = filesOf(join(deck, 'dist/slides')).filter(file => /\.(js|html|json)$/.test(file)).map(file => readFileSync(file, 'utf8'))
  expect(shipped.some(text => text.includes(path!))).toBe(true)
  expect(shipped.filter(text => text.includes(deck))).toEqual([])

  await page.getByTitle('Delete', { exact: true }).click()
  await expect.poll(() => existsSync(drawing), { timeout: 15_000 }).toBe(false)
}, 360_000)
