import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveDirectory } from '@lincyaw/compiler'
import { chromium, expect as browserExpect } from '@playwright/test'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { BIN, presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/preview', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
const AGENT = /presmium-preview|data-preview-highlight|pm-preview-pin/

let dir: string
let env: Record<string, string>
beforeAll(() => {
  mkdirSync(WORK, { recursive: true })
  dir = mkdtempSync(join(WORK, 'preview-'))
  cpSync(FIXTURE, dir, { recursive: true })
  const home = `${dir}.home`
  mkdirSync(home)
  env = { HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(`${dir}.home`, { recursive: true, force: true })
})

it('builds a web form that takes no preview, even framed by another site that asks for one, and slides without the preview agent', async () => {
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'web,slides', '--out', 'out'], env)
  expect(code, stdout + stderr).toBe(0)
  const config = JSON.parse(/<script type="application\/json" id="presmium-app">(.*?)<\/script>/s.exec(readFileSync(join(dir, 'out/web/index.html'), 'utf8'))![1]!) as { origins: string[] }
  expect(config.origins).toEqual([])
  const site = await serveDirectory(join(dir, 'out/web'))
  const framing = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<iframe src="${new URL('/?presmium-preview=probe', site.url).href}" style="width:800px;height:600px"></iframe>`))
  await new Promise<void>(resolve => framing.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const told: unknown[] = []
    await page.exposeFunction('told', (data: unknown) => told.push(data))
    await page.addInitScript(() => window.addEventListener('message', event => void (window as unknown as { told(data: unknown): void }).told(event.data)))
    await page.goto(`http://127.0.0.1:${(framing.address() as AddressInfo).port}/`)
    const frame = page.frameLocator('iframe')
    await browserExpect(frame.locator('.pm-section').first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1000)
    await browserExpect(frame.locator('html')).not.toHaveAttribute('data-presmium-preview', 'on')
    expect(told).toEqual([])
  } finally {
    await browser.close()
    await site.close()
    framing.close()
  }
  const slides = readdirSync(join(dir, 'out/slides'), { recursive: true, encoding: 'utf8' }).filter(file => /\.(?:html|js|mjs|css|json)$/.test(file) && AGENT.test(readFileSync(join(dir, 'out/slides', file), 'utf8')))
  expect(slides).toEqual([])
  const markdown = readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')
  expect(markdown).toContain('<div class="pm-slide-section" data-section="start">\n\n# Start\n\n<div class="pm-block" data-block="intro" data-section="start" data-step="0">\n\nA block of the first section.\n\n</div>')
  expect(markdown).toContain('<div class="pm-block" data-block="later" data-section="start" data-step="1">\n\n<div v-click="1">\n\nA block of its first step.')
  expect(existsSync(join(dir, '.presmium/slides/setup'))).toBe(false)
}, 300_000)

async function dev<T>(args: string[], form: 'web' | 'slides', read: (url: string) => Promise<T>): Promise<T> {
  const { NODE_ENV: _test, ...inherited } = process.env
  const child = spawn(process.execPath, [BIN, 'dev', ...args], { cwd: dir, env: { ...inherited, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  try {
    const url = await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => fail(new Error(`no ${form} dev server:\n${output}`)), 180_000)
      child.stdout.on('data', () => {
        const match = new RegExp(`^${form} {2}(http\\S+)$`, 'm').exec(output)
        if (match) {
          clearTimeout(timer)
          done(match[1]!)
        }
      })
      child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    return await read(url)
  } finally {
    const exited = new Promise(done => child.once('exit', done))
    child.kill('SIGTERM')
    await exited
  }
}

async function served(url: string, path: string): Promise<Response> {
  const response = await fetch(new URL(path, url))
  expect(response.status, path).toBe(200)
  return response
}

it('runs presmium dev without the preview agent', async () => {
  const plain = await dev(['--to', 'web'], 'web', async (web) => {
    const response = await served(web, '')
    return { csp: response.headers.get('content-security-policy'), html: await response.text() }
  })
  const config = JSON.parse(/<script type="application\/json" id="presmium-app">(.*?)<\/script>/s.exec(plain.html)![1]!) as { origins: string[], plugins: string[] }
  expect(config.plugins).toContain('@lincyaw/addon-core')
  expect(config.origins).toEqual([])
  expect(plain.csp).toBeNull()

  const deck = join(dir, '.presmium/dev/slides')
  const page = await dev(['--to', 'slides'], 'slides', async (slides) => {
    const response = await served(slides, '')
    return { csp: response.headers.get('content-security-policy'), config: readFileSync(join(deck, 'vite.config.ts'), 'utf8'), markdown: readFileSync(join(deck, 'slides.md'), 'utf8') }
  })
  expect(page.markdown).toContain('<div class="pm-block" data-block="intro" data-section="start" data-step="0">')
  expect(existsSync(join(deck, 'setup')) || existsSync(join(deck, 'preview.json'))).toBe(false)
  expect(page.config).not.toMatch(/presmiumPreview|frame-ancestors|client\/preview\.ts/)
  expect(page.markdown).not.toContain('presmiumDocument')
  expect(page.csp).toBeNull()
}, 500_000)
