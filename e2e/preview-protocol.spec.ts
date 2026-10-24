import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { stepKeys, stepTrail, trailStep } from '../packages/kernel/src/step-keys.ts'
import type { IRSection } from '../packages/kernel/src/ir.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/preview-protocol')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const TOKEN = 'preview-protocol-token'
const COMMANDS = ['go', 'highlight', 'pick', 'pins', 'marks', 'appearance', 'edit', 'flash']
// The web form can also pause and resume its runtime; the slides cannot.
const WEB_COMMANDS = [...COMMANDS, 'activity']

test.describe.configure({ mode: 'serial', timeout: 420_000 })

function clean(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

async function hostServer(): Promise<{ origin: string, close(): Promise<void> }> {
  const html = readFileSync(join(FIXTURE, 'host.html'))
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(html)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

let dir: string
let service: ChildProcess
let url: string
let allowed: Awaited<ReturnType<typeof hostServer>>
let other: Awaited<ReturnType<typeof hostServer>>

test.beforeAll(async () => {
  test.setTimeout(300_000)
  allowed = await hostServer()
  other = await hostServer()
  const work = join(ROOT, 'e2e/fixtures/regression/.presmium')
  mkdirSync(work, { recursive: true })
  dir = mkdtempSync(join(work, 'e2e-preview-protocol-'))
  cpSync(join(FIXTURE, 'workspace'), dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  mkdirSync(join(dir, 'node_modules/@lincyaw'), { recursive: true })
  symlinkSync(join(ROOT, 'packages/host'), join(dir, 'node_modules/@lincyaw/host'), 'junction')
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  const home = `${dir}.home`
  mkdirSync(home)
  service = spawn(process.execPath, [PRESMIUM, 'serve', '--preview-origin', allowed.origin, '--port', '0'], {
    cwd: dir,
    env: clean({ PRESMIUM_SERVICE_TOKEN: TOKEN, HOME: home, XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), XDG_CONFIG_HOME: join(home, 'config') }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  url = await new Promise<string>((done, fail) => {
    const read = (chunk: Buffer) => {
      output += chunk
      const match = /^serve {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    }
    service.stdout!.on('data', read)
    service.stderr!.on('data', read)
    service.once('exit', code => fail(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
})

test.afterAll(async () => {
  if (service && service.exitCode === null) {
    const exited = new Promise(done => service.once('exit', done))
    service.kill('SIGTERM')
    await exited
  }
  await allowed?.close()
  await other?.close()
  for (const path of [dir, `${dir}.home`]) if (path) rmSync(path, { recursive: true, force: true })
})

async function route<T>(path: string): Promise<T> {
  const response = await fetch(`${url}/__presmium/presmium.workspace/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  expect(response.status, await response.clone().text()).toBe(200)
  return await response.json() as T
}

const revision = async () => (await route<{ revision: string }>('ir?document=talk')).revision
async function beta(): Promise<{ keys: string[][], step: number }> {
  const section = (await route<{ doc: { sections: IRSection[] } }>('ir?document=talk')).doc.sections.find(s => s.id === 'beta')!
  return { keys: stepKeys(section), step: section.blocks.find(b => b.id === 'beta-step')!.at }
}

async function open(page: Page, form: 'web' | 'slides', host = allowed): Promise<string> {
  const addresses = await route<{ web: string, slides?: string }>('preview?document=talk')
  const src = form === 'web' ? addresses.web : addresses.slides
  expect(src, `the ${form} preview's address`).toBeTruthy()
  const nonce = randomUUID()
  await page.goto(`${host.origin}/host.html`)
  await page.evaluate(([address, value]) => (window as unknown as Host).host.open(address!, value!), [src, nonce])
  return nonce
}

interface Host {
  host: {
    open(src: string, nonce: string): void
    send(type: string, fields?: Record<string, unknown>, nonce?: string): void
    of(type: string): Record<string, unknown>[]
  }
}

const send = (page: Page, type: string, fields: Record<string, unknown> = {}, nonce?: string) =>
  page.evaluate(([t, f, n]) => (window as unknown as Host).host.send(t as string, f as Record<string, unknown>, n as string | undefined), [type, fields, nonce] as const)
const received = (page: Page, type: string) => page.evaluate(t => (window as unknown as Host).host.of(t), type)
const message = (page: Page, type: string, fields: Record<string, unknown>, timeout = 30_000) =>
  expect.poll(() => received(page, type), { timeout }).toContainEqual(expect.objectContaining({ type, ...fields }))

async function ready(page: Page, form: 'web' | 'slides', fields: Record<string, unknown>): Promise<string> {
  let nonce = ''
  await expect(async () => {
    nonce = await open(page, form)
    await message(page, 'ready', fields, 90_000)
  }).toPass({ timeout: 200_000 })
  return nonce
}

function edit(from: string, to: string): void {
  const file = join(dir, 'talk/lecture.md')
  const text = readFileSync(file, 'utf8')
  expect(text).toContain(from)
  writeFileSync(file, text.replace(from, to))
}

async function next(page: Page, type: string, count: number): Promise<Record<string, unknown>> {
  await expect.poll(async () => (await received(page, type)).length, { timeout: 30_000 }).toBeGreaterThan(count)
  return (await received(page, type)).at(-1)!
}

async function select(page: Page, selector: string): Promise<void> {
  await page.frameLocator('#preview').locator(selector).evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

test('the web form takes every command and reports its position, a pick, the selection, a new IR and a plugin that failed', async ({ page }) => {
  await ready(page, 'web', { renderer: 'web', document: 'talk', revision: await revision(), capabilities: WEB_COMMANDS })
  const frame = page.frameLocator('#preview')
  await message(page, 'position', { section: 'preview-protocol', step: 0, trail: [], view: 'document' })

  await send(page, 'go', { section: 'gamma' })
  await expect(frame.getByRole('heading', { name: 'Gamma' })).toBeInViewport()
  await message(page, 'position', { section: 'gamma', step: 0 })

  const whole = await beta()
  await send(page, 'go', { section: 'beta', step: whole.step, trail: stepTrail(whole.keys, whole.step), view: 'present' })
  await expect(frame.locator('.pm-present')).toHaveAttribute('data-section', 'beta')
  await message(page, 'position', { section: 'beta', step: 2, trail: ['beta-web', 'beta-step'], view: 'present' })
  await send(page, 'go', { section: 'gamma', view: 'document' })
  await expect.poll(async () => (await received(page, 'position')).at(-1)).toMatchObject({ section: 'gamma', step: 0, view: 'document' })
  await expect(frame.locator('.pm-present')).toHaveCount(0)

  const intro = frame.locator('.pm-block[data-block="beta-intro"]')
  await send(page, 'highlight', { target: { section: 'beta', block: 'beta-intro' } })
  await expect(intro).toHaveAttribute('data-preview-highlight', '')
  await expect(intro).toBeInViewport()
  await send(page, 'highlight', { target: null })
  await expect(intro).not.toHaveAttribute('data-preview-highlight')

  await send(page, 'pick', { on: true })
  const text = frame.locator('.pm-block[data-block="alpha-text"]')
  await expect(async () => {
    await text.hover()
    await expect(text).toHaveAttribute('data-preview-hover', '', { timeout: 1000 })
  }).toPass()
  await text.click()
  await message(page, 'picked', { section: 'alpha', block: 'alpha-text', step: 0, trail: [] })
  await frame.locator('.pm-block[data-block="beta-step"]').click()
  await message(page, 'picked', { section: 'beta', block: 'beta-step', step: 2, trail: ['beta-web', 'beta-step'] })
  await send(page, 'pick', { on: false })
  await expect(text).not.toHaveAttribute('data-preview-hover')

  const alpha = frame.locator('.pm-block[data-block="alpha-text"]')
  await send(page, 'pins', { targets: [{ id: 'one', section: 'alpha', block: 'alpha-text', label: '1' }] })
  await expect(alpha.locator('.pm-preview-pin')).toHaveText('1')
  await send(page, 'pins', { targets: [] })
  await expect(alpha.locator('.pm-preview-pin')).toHaveCount(0)

  await select(page, '.pm-block[data-block="alpha-text"] p')
  await message(page, 'selection', { selection: expect.objectContaining({ section: 'alpha', block: 'alpha-text', text: expect.stringContaining('The first block of alpha') }) })
  await frame.locator('body').evaluate(() => document.getSelection()!.removeAllRanges())
  await message(page, 'selection', { selection: null })

  await expect(alpha.locator('.pm-role-mark')).toHaveCount(0)
  await send(page, 'marks', { on: true })
  await expect(alpha.locator('.pm-role-mark')).toHaveText('〔mark here〕')
  await send(page, 'marks', { on: false })
  await expect(alpha.locator('.pm-role-mark')).toHaveCount(0)

  await send(page, 'appearance', { dark: true })
  await expect(frame.locator('html')).toHaveClass(/\bdark\b/)
  await send(page, 'appearance', { dark: false })
  await expect(frame.locator('html')).not.toHaveClass(/\bdark\b/)

  edit('Gamma closes the deck.', 'Gamma closes the deck, saved again.')
  await expect(frame.getByText('Gamma closes the deck, saved again.')).toBeVisible({ timeout: 30_000 })
  await expect.poll(revision).not.toBe((await received(page, 'ready'))[0]!.revision)
  await message(page, 'updated', { revision: await revision() })

  await message(page, 'report', { level: 'error', plugin: 'fixture.preview.throws', message: expect.stringContaining('fails to start on purpose') })
})

interface Point { x: number, y: number }
interface Rect extends Point { width: number, height: number }

const boxOf = (element: Locator) => element.evaluate((el): Rect => {
  const box = el.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
})
const textBoxOf = (element: Locator) => element.evaluate((el): Rect => {
  const range = document.createRange()
  range.selectNodeContents(el)
  const box = range.getBoundingClientRect()
  return { x: box.x, y: box.y, width: box.width, height: box.height }
})
function near(rect: unknown, box: Rect, by = 1): void {
  expect(rect).toEqual({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) })
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs((rect as Rect)[key] - box[key]), key).toBeLessThanOrEqual(by)
}

async function clicked(page: Page, clicks: number): Promise<Record<string, unknown>> {
  await expect.poll(async () => (await received(page, 'picked')).some(m => m.clicks === clicks)).toBe(true)
  return (await received(page, 'picked')).findLast(m => m.clicks === clicks)!
}

async function edits(page: Page, target: Record<string, string>): Promise<boolean[]> {
  return (await received(page, 'editing')).filter(m => JSON.stringify(m.target) === JSON.stringify(target)).map(m => m.active as boolean)
}

test('the web form tells where a pick and a selection are and follows them as it scrolls; a block and a heading are edited in place', async ({ page }) => {
  await ready(page, 'web', { renderer: 'web', capabilities: WEB_COMMANDS })
  const frame = page.frameLocator('#preview')
  const text = frame.locator('.pm-block[data-block="alpha-text"]')
  const alpha = { section: 'alpha', block: 'alpha-text' }

  await send(page, 'pick', { on: true })
  await text.click()
  const one = await clicked(page, 1)
  expect(one).toMatchObject({ ...alpha, step: 0, point: { x: expect.any(Number), y: expect.any(Number) } })
  near(one.rect, await boxOf(text))

  const lastRect = async () => (await received(page, 'rect')).at(-1)?.rect
  const preview = page.locator('#preview')
  const bottom = (one.rect as Rect).y + (one.rect as Rect).height
  // A frame just taller than the block, so that the page scrolls far enough to take the block out of sight.
  await preview.evaluate((el: HTMLElement, height) => void (el.style.height = `${height}px`), Math.ceil(bottom + 80))
  await frame.locator('html').evaluate(() => window.scrollBy(0, 40))
  await expect(async () => near(await lastRect(), { ...one.rect as Rect, y: (one.rect as Rect).y - 40 })).toPass({ timeout: 10_000 })
  await text.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().bottom + 20))
  await expect.poll(lastRect).toBeNull()
  await frame.locator('html').evaluate(() => window.scrollTo(0, 0))
  await preview.evaluate((el: HTMLElement) => void (el.style.height = ''))
  await expect(async () => near(await lastRect(), one.rect as Rect)).toPass({ timeout: 10_000 })

  const selections = (await received(page, 'selection')).length
  await select(page, '.pm-block[data-block="alpha-text"] p')
  const chosen = (await next(page, 'selection', selections)).selection as { rect: Rect }
  near(chosen.rect, await textBoxOf(text.locator('p')))
  await frame.locator('body').evaluate(() => document.getSelection()!.removeAllRanges())
  await message(page, 'selection', { selection: null })
  const quiet = (await received(page, 'rect')).length
  await frame.locator('html').evaluate(() => window.scrollBy(0, 10))
  await page.waitForTimeout(500)
  expect(await received(page, 'rect')).toHaveLength(quiet)

  const original = await text.textContent()
  await send(page, 'edit', { target: alpha })
  await expect.poll(() => edits(page, alpha)).toEqual([true])
  await expect(text).toHaveAttribute('contenteditable', 'true')
  await expect(text).toHaveAttribute('data-preview-editing', '')
  await page.keyboard.type(' gone')
  await expect(text).toContainText('the author. gone')
  await page.keyboard.press('Escape')
  await expect.poll(() => edits(page, alpha)).toEqual([true, false])
  await expect(text).not.toHaveAttribute('contenteditable')
  expect(await text.textContent()).toBe(original)
  await send(page, 'marks', { on: true })
  await expect(text.locator('.pm-role-mark')).toHaveText('〔mark here〕')
  await send(page, 'marks', { on: false })
  await expect(text.locator('.pm-role-mark')).toHaveCount(0)

  await text.dblclick()
  const two = await clicked(page, 2)
  expect(two).toMatchObject(alpha)
  expect(await frame.locator('body').evaluate(() => document.getSelection()!.toString())).toBe('')
  await send(page, 'edit', { target: alpha, at: two.point as Point })
  await expect.poll(() => edits(page, alpha)).toEqual([true, false, true])
  await page.keyboard.type(' Edited')
  await page.keyboard.press('Enter')
  await expect.poll(() => edits(page, alpha)).toEqual([true, false, true, false])
  const [edited, ...more] = await received(page, 'edited')
  expect(more).toEqual([])
  expect(edited).toMatchObject({ target: alpha, before: original })
  expect(edited!.after).not.toBe(original)
  expect((edited!.after as string).replace(' Edited', '')).toBe(original)
  expect((edited!.after as string).indexOf(' Edited'), 'the caret goes where the block was double-clicked').toBeLessThan(original!.trimEnd().length)
  await expect(text).toContainText('Edited')
  await expect(text).not.toHaveAttribute('contenteditable')

  const heading = { section: 'gamma' }
  await send(page, 'edit', { target: heading })
  await expect(frame.getByRole('heading', { name: 'Gamma' })).toHaveAttribute('contenteditable', 'true')
  await page.keyboard.type(' again')
  await page.keyboard.press('Enter')
  await expect.poll(() => edits(page, heading)).toEqual([true, false])
  const titled = (await received(page, 'edited')).at(-1)!
  expect(titled).toMatchObject({ target: heading, before: expect.stringContaining('Gamma') })
  expect(titled.after).toBe((titled.before as string).replace('Gamma', 'Gamma again'))

  await send(page, 'edit', { target: { section: 'alpha', block: 'no-such-block' } })
  await expect.poll(() => edits(page, { section: 'alpha', block: 'no-such-block' })).toEqual([false])
})

test('the agent answers no other origin, no other nonce, and does not start out of a frame', async ({ page }) => {
  await open(page, 'web', other)
  await page.waitForTimeout(5000)
  expect(await received(page, 'ready')).toEqual([])

  const nonce = await ready(page, 'web', { renderer: 'web' })
  const alpha = page.frameLocator('#preview').locator('.pm-block[data-block="alpha-text"]')
  const pins = { targets: [{ id: 'x', section: 'alpha', block: 'alpha-text', label: 'X' }] }
  await send(page, 'pins', pins, randomUUID())
  await page.evaluate(([fields, value]) => {
    const preview = (document.getElementById('preview') as HTMLIFrameElement)
    const sibling = document.createElement('iframe')
    document.body.append(sibling)
    const script = sibling.contentDocument!.createElement('script')
    script.textContent = `parent.document.getElementById('preview').contentWindow.postMessage(${JSON.stringify({ protocol: 'presmium-preview', version: 1, nonce: value, type: 'pins', ...fields })}, ${JSON.stringify(new URL(preview.src).origin)})`
    sibling.contentDocument!.body.append(script)
  }, [pins, nonce] as const)
  await page.waitForTimeout(1000)
  await expect(alpha.locator('.pm-preview-pin')).toHaveCount(0)
  await send(page, 'pins', pins, nonce)
  await expect(alpha.locator('.pm-preview-pin')).toHaveText('X')

  await page.route(address => address.searchParams.has('presmium-preview'), async (framed) => {
    const response = await framed.fetch()
    const headers = { ...response.headers() }
    delete headers['content-security-policy']
    await framed.fulfill({ response, headers })
  })
  await open(page, 'web', other)
  const stray = page.frameLocator('#preview')
  await expect(stray.locator('.pm-block[data-block="alpha-text"]')).toBeVisible({ timeout: 90_000 })
  await expect(stray.locator('html')).toHaveAttribute('data-presmium-preview', 'on')
  await send(page, 'pins', pins)
  await page.waitForTimeout(1000)
  await expect(stray.locator('.pm-preview-pin')).toHaveCount(0)
  expect(await received(page, 'ready')).toEqual([])
  await page.unrouteAll()

  const { web } = await route<{ web: string }>('preview?document=talk')
  const outside = new URL(web)
  outside.searchParams.set('presmium-preview', randomUUID())
  await page.goto(outside.href)
  await expect(page.locator('.pm-block[data-block="alpha-text"]')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  await expect(page.locator('html')).not.toHaveAttribute('data-presmium-preview')
  await expect(page.locator('#presmium-preview-style')).toHaveCount(0)
})
