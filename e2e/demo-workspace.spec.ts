import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openDevPage, serve as staticSite } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WORKSPACE = join(ROOT, 'examples/cs336')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')

function clean(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return env
}

function serve(dir: string): Promise<{ child: ChildProcess, url: string }> {
  const child = spawn(process.execPath, [PRESMIUM, 'serve', dir, '--port', '0'], { cwd: ROOT, env: clean(), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  return new Promise((resolve, reject) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) resolve({ child, url: found[1]! })
    })
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    child.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
  await exited
  clearTimeout(timer)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

const manifest = JSON.parse(readFileSync(join(WORKSPACE, 'coverage.json'), 'utf8')) as { lectures: { lecture: number, kind: string, entry: string, steps?: number, nativeSteps?: { section: number, start: number, end: number }[], pages?: { page: number }[] }[] }
let site: Awaited<ReturnType<typeof staticSite>>
test.beforeAll(async () => {
  test.setTimeout(900_000)
  if (!process.env.PRESMIUM_CS336_REUSE_BUILD || !existsSync(join(WORKSPACE, 'dist/web/index.html'))) {
    execFileSync('pnpm', ['demo:build'], { cwd: ROOT, stdio: 'pipe', timeout: 850_000 })
  }
  execFileSync(process.execPath, [join(WORKSPACE, 'tools/audit.mjs')], { stdio: 'pipe' })
  site = await staticSite(join(WORKSPACE, 'dist/web'))
})
test.afterAll(async () => { await site?.close() })

test('CS336 is the sole example, with all 17 lectures and every PDF page; the editable copy loads the Markdown lectures', async ({ page }) => {
  await page.goto(site.url)
  await expect(page.locator('.pm-site-home__document')).toHaveCount(17)
  for (const lecture of manifest.lectures.filter(row => row.kind === 'pdf')) {
    const id = String(lecture.lecture).padStart(2, '0')
    await page.goto(`${site.url}/lecture_${id}/`)
    await expect(page.locator('.pm-section--document .pm-board')).toHaveCount(0)
    const headings = await page.locator('.pm-section h2').allTextContents()
    expect(headings.length).toBeGreaterThan(0)
    expect(headings.every(title => !/ · \d+$/.test(title))).toBe(true)
    const image = page.locator('.pm-section img').first()
    await image.scrollIntoViewIfNeeded()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    await page.goto(`${site.url}/lecture_${id}/slides/#/${lecture.pages!.length + 1}`)
    const originalPage = page.locator(`.slidev-page-${lecture.pages!.length + 1} img`).first()
    await expect(originalPage).toBeVisible()
    const bounds = await originalPage.boundingBox()
    const viewport = page.viewportSize()!
    expect(bounds!.x).toBeGreaterThanOrEqual(-1)
    expect(bounds!.y).toBeGreaterThanOrEqual(-1)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
  }
  const work = join(ROOT, '.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-cs336-'))
  let server: Awaited<ReturnType<typeof serve>> | undefined
  try {
    execFileSync(process.execPath, [join(WORKSPACE, 'try.mjs'), dir], { stdio: 'pipe' })
    expect(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('1')
    server = await serve(dir)
    await page.goto(server.url)
    await expect(page.locator('.pm-site-home__document')).toHaveCount(17)
    await openDevPage(page, `${server.url}/lecture_01/`, page.locator('.pm-section img').first())
    await expect(page.locator('.pm-diagnostics')).toHaveCount(0)
    await expect(page.locator('.pm-section').first()).not.toContainText('Original content')
  } finally {
    await stop(server?.child)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Python documents flow by topic while the separate PPT retains reversible native steps', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const lecture of manifest.lectures.filter(row => row.kind === 'python')) {
    const id = String(lecture.lecture).padStart(2, '0')
    const source = readFileSync(join(WORKSPACE, lecture.entry), 'utf8')
    expect(source).not.toMatch(/trace-plugin|cs336-trace|Original content|Recorded inspection/)
    const ranges = lecture.nativeSteps! as unknown as { section: number, steps: number, blocks: { label: string, at: number, until?: number }[] }[]
    const range = ranges.find(range => range.blocks.some(block => block.until !== undefined && range.blocks.some(next => next.at === block.until))) ?? ranges.find(range => range.steps > 1)!
    const replacement = range.blocks.find(block => block.until !== undefined && range.blocks.some(next => next.at === block.until))
    const target = replacement?.until ?? range.blocks.find(block => block.at > 0)!.at
    const before = replacement ?? range.blocks.find(block => block.at === 0)!
    const after = range.blocks.find(block => block.at === target && block.label !== before.label)!
    await page.goto(`${site.url}/lecture_${id}/`)
    await expect(page.locator('.cs336-trace')).toHaveCount(0)
    await expect(page.locator('.pm-section--document .pm-board')).toHaveCount(0)
    const documentHeadings = await page.locator('.pm-section h2').allTextContents()
    expect(documentHeadings.filter(title => title === 'Why did we make this course?').length).toBeLessThanOrEqual(1)
    expect(source).not.toMatch(/\{slide\}|:until:|\"dtype\"|\"contents\"/)
    if (id === '01') {
      const topic = page.locator('.pm-section[data-section="cs336-01-topic-003"]')
      await expect(topic.locator('h2')).toContainText('Why did we make this course?')
      await expect(topic.locator('ul').first().locator('li')).toHaveCount(3)
      await expect(topic).toContainText('understanding via building')
      await page.setViewportSize({ width: 375, height: 812 })
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      expect(width.scroll).toBeLessThanOrEqual(width.client)
      await page.setViewportSize({ width: 1280, height: 720 })
    }
    await page.goto(`${site.url}/lecture_${id}/slides/#/${range.section + 1}?clicks=${target}`)
    const parent = page.locator(`.slidev-page-${range.section + 1}`).first()
    const next = parent.locator(`.pm-block[data-block="${after.label}"]`)
    const previous = parent.locator(`.pm-block[data-block="${before.label}"]`)
    await expect(next).toBeVisible()
    if (replacement) await expect(previous.locator('.slidev-vclick-target').first()).toHaveClass(/slidev-vclick-hidden/)
    await page.keyboard.press('ArrowLeft')
    await expect(next.locator('.slidev-vclick-target').first()).toHaveClass(/slidev-vclick-hidden/)
    await expect(previous).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(next).toBeVisible()
    if (replacement) await expect(previous.locator('.slidev-vclick-target').first()).toHaveClass(/slidev-vclick-hidden/)
    await expect(parent).not.toContainText(/Original content|Original step|Step \d+ \/ \d{3}/)
  }
  expect(errors.filter(text => !/Wake Lock permission|Failed to patch FloatingVue/.test(text))).toEqual([])
})
