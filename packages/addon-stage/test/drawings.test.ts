// Annotations (P-04, K-09): `presmium dev --to slides` on a deck that uses the stage saves a
// drawing made in the page in the source deck's .presmium/drawings, where it is committed with the
// deck; `presmium build` ships it without the author's paths; clearing it removes the file.
// The deck lives in the demo's ignored .presmium directory, so it resolves Slidev, its theme and
// the plugins from the demo's node_modules.
import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import type { Browser } from '@playwright/test'
import { afterAll, expect, it } from 'vitest'

const DEMO = fileURLToPath(new URL('../../../examples/demo', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
/** The environment of a shell: without Vitest's NODE_ENV=test, which would change how Vite builds. */
const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_ENV'))

const LECTURE = `---
title: Drawings
plugins:
  - '@presmium/slidev-addon-stage'
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

/** Starts `presmium dev --to slides` and resolves with the URL of the slides. */
function startDev(): Promise<string> {
  dev = spawn(process.execPath, [PRESMIUM, 'dev', '--to', 'slides'], { cwd: deck, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
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

function build(): Promise<{ code: number, output: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [PRESMIUM, 'build', '--to', 'slides'], { cwd: deck, env: ENV, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr })
    })
  })
}

function filesOf(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).map(file => join(dir, file)).filter(file => statSync(file).isFile())
}

it('a drawing made in presmium dev is saved in the deck, ships with the build, and clearing removes it', async () => {
  const url = await startDev()
  browser = await chromium.launch()
  const page = await browser.newPage()
  // The first visit may reload once while Vite optimizes dependencies.
  for (let visit = 0; visit < 2; visit++) {
    await page.goto(url)
    await page.locator('.slidev-page h1', { hasText: 'Drawings' }).first().waitFor()
    await page.waitForLoadState('networkidle')
  }

  await page.getByTitle('Show drawing toolbar').click()
  const box = (await page.locator('#slide-content').boundingBox())!
  const y = box.y + box.height * 0.7
  await page.mouse.move(box.x + box.width * 0.3, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.04), y - i * 6)
  await page.mouse.up()
  await expect.poll(() => existsSync(drawing), { timeout: 15_000 }).toBe(true)
  // Saved in the deck, not in the generated (ignored) dev deck.
  expect(existsSync(join(deck, '.presmium/dev/slides/.presmium'))).toBe(false)
  const path = /<path[^>]* d="([^"]{12})/.exec(readFileSync(drawing, 'utf8'))?.[1]
  expect(path).toBeTruthy()

  const built = await build()
  expect(built.code, built.output).toBe(0)
  const shipped = filesOf(join(deck, 'dist/slides')).filter(file => /\.(js|html|json)$/.test(file)).map(file => readFileSync(file, 'utf8'))
  expect(shipped.some(text => text.includes(path!))).toBe(true)
  expect(shipped.filter(text => text.includes(deck))).toEqual([])

  // The drawing toolbar's "Delete" clears the slide's drawing.
  await page.getByTitle('Delete', { exact: true }).click()
  await expect.poll(() => existsSync(drawing), { timeout: 15_000 }).toBe(false)
}, 240_000)
