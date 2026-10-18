// The preview protocol v1 (P-116, P-120; docs/design-dsh.md section 4, WP-96a). `presmium serve --headless` of a
// workspace copied from e2e/fixtures/preview-protocol/workspace, a git repository of its own, with one workbench
// origin (`--preview-origin`) and a service token; a host page without any framework
// (e2e/fixtures/preview-protocol/host.html), served on that origin, embeds the preview the service gives
// (`GET preview`) and drives it:
// - the web form and the slides each say `ready` (the document, the revision of `GET ir`, every command), then every
//   command takes effect: `go` (with a trail of the whole document's steps, with a view of the web form),
//   `highlight`, `pick` (the block under the pointer framed, a click says `picked`), `pins`, `marks` (the author's
//   mark of a role without children), `appearance`; the page reports its `position`, the text selected
//   (`selection`, and none), the IR it shows after the source is saved (`updated`, the revision of `GET ir`) and a
//   plugin that failed to start (`report`);
// - beta has a step only the web form has (a web-only block), so the slides number beta's steps apart: their
//   position and picks carry the trail, from which the whole document's step is found (`trailStep`), as a workbench
//   finds it; a block a click has not shown yet is not highlighted, pinned or picked where it stands, and a
//   highlight brings its step in;
// - a host of another origin gets nothing (the frame is refused, and framed all the same the agent neither speaks
//   to it nor takes its commands), a message of another window or with another nonce does nothing, and the page
//   out of a frame starts no agent.
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { stepKeys, stepTrail, trailStep } from '../packages/kernel/src/follow.ts'
import type { IRSection } from '../packages/kernel/src/ir.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/preview-protocol')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const TOKEN = 'preview-protocol-token'
const COMMANDS = ['go', 'highlight', 'pick', 'pins', 'marks', 'appearance']

test.describe.configure({ mode: 'serial', timeout: 420_000 })

/** The test's environment without Vitest's or Presmium's variables or credentials, then `extra`. */
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

/** The host page on a free port of this machine: one allowed (`--preview-origin`), one not. */
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
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  dir = mkdtempSync(join(work, 'e2e-preview-protocol-'))
  cpSync(join(FIXTURE, 'workspace'), dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  // The fixture plugin's slides setup imports the host, which the demo does not depend on.
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(join(ROOT, 'packages/host'), join(dir, 'node_modules/@presmium/host'), 'junction')
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  // Nothing of the service's outside the test's directories.
  const home = `${dir}.home`
  mkdirSync(home)
  service = spawn(process.execPath, [PRESMIUM, 'serve', '--headless', '--preview-origin', allowed.origin, '--port', '0'], {
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

/** A route of the workspace service, with its token. */
async function route<T>(path: string): Promise<T> {
  const response = await fetch(`${url}/__presmium/presmium.workspace/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  expect(response.status, await response.clone().text()).toBe(200)
  return await response.json() as T
}

const revision = async () => (await route<{ revision: string }>('ir?document=talk')).revision
/** Beta as the whole document has it (`GET ir`): its steps' keys, and the step of beta-step (2, after the web-only block). */
async function beta(): Promise<{ keys: string[][], step: number }> {
  const section = (await route<{ doc: { sections: IRSection[] } }>('ir?document=talk')).doc.sections.find(s => s.id === 'beta')!
  return { keys: stepKeys(section), step: section.blocks.find(b => b.id === 'beta-step')!.at }
}

/** Opens the host page of `host` and in it the preview of a form, with a nonce of its own. */
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
/** Waits until the page has sent a message of `type` with these fields. */
const message = (page: Page, type: string, fields: Record<string, unknown>, timeout = 30_000) =>
  expect.poll(() => received(page, type), { timeout }).toContainEqual(expect.objectContaining({ type, ...fields }))

/**
 * Opens a form's preview in the allowed host and waits for its `ready`; a first visit may meet the dev server
 * optimizing its dependencies, or a request the busy host drops, so the preview is opened again until it is ready.
 */
async function ready(page: Page, form: 'web' | 'slides', fields: Record<string, unknown>): Promise<string> {
  let nonce = ''
  await expect(async () => {
    nonce = await open(page, form)
    await message(page, 'ready', fields, 90_000)
  }).toPass({ timeout: 200_000 })
  return nonce
}

/** Saves the source with `from` replaced by `to`, as an editor does. */
function edit(from: string, to: string): void {
  const file = join(dir, 'talk/lecture.md')
  const text = readFileSync(file, 'utf8')
  expect(text).toContain(from)
  writeFileSync(file, text.replace(from, to))
}

/** The messages of `type` once the page has sent more than `count` of them: the last one. */
async function next(page: Page, type: string, count: number): Promise<Record<string, unknown>> {
  await expect.poll(async () => (await received(page, type)).length, { timeout: 30_000 }).toBeGreaterThan(count)
  return (await received(page, type)).at(-1)!
}

/** Selects the text of an element of the preview, as a reader drags over it. */
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
  await ready(page, 'web', { renderer: 'web', document: 'talk', revision: await revision(), capabilities: COMMANDS })
  const frame = page.frameLocator('#preview')
  await message(page, 'position', { section: 'preview-protocol', step: 0, trail: [], view: 'document' })

  // go, and the position it reports.
  await send(page, 'go', { section: 'gamma' })
  await expect(frame.getByRole('heading', { name: 'Gamma' })).toBeInViewport()
  await message(page, 'position', { section: 'gamma', step: 0 })

  // go with the whole document's trail, in another view (the presentation), and back to the document.
  const whole = await beta()
  await send(page, 'go', { section: 'beta', step: whole.step, trail: stepTrail(whole.keys, whole.step), view: 'present' })
  await expect(frame.locator('.pm-present')).toHaveAttribute('data-section', 'beta')
  await message(page, 'position', { section: 'beta', step: 2, trail: ['beta-web', 'beta-step'], view: 'present' })
  await send(page, 'go', { section: 'gamma', view: 'document' })
  await expect.poll(async () => (await received(page, 'position')).at(-1)).toMatchObject({ section: 'gamma', step: 0, view: 'document' })
  await expect(frame.locator('.pm-present')).toHaveCount(0)

  // highlight: framed, and cleared.
  const intro = frame.locator('.pm-block[data-block="beta-intro"]')
  await send(page, 'highlight', { target: { section: 'beta', block: 'beta-intro' } })
  await expect(intro).toHaveAttribute('data-preview-highlight', '')
  await expect(intro).toBeInViewport()
  await send(page, 'highlight', { target: null })
  await expect(intro).not.toHaveAttribute('data-preview-highlight')

  // pick: the block under the pointer framed; a click on a block says `picked`, with its step and trail, and does
  // nothing else.
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

  // pins beside a block, and none.
  const alpha = frame.locator('.pm-block[data-block="alpha-text"]')
  await send(page, 'pins', { targets: [{ id: 'one', section: 'alpha', block: 'alpha-text', label: '1' }] })
  await expect(alpha.locator('.pm-preview-pin')).toHaveText('1')
  await send(page, 'pins', { targets: [] })
  await expect(alpha.locator('.pm-preview-pin')).toHaveCount(0)

  // The text selected in a block, and none.
  await select(page, '.pm-block[data-block="alpha-text"] p')
  await message(page, 'selection', { selection: expect.objectContaining({ section: 'alpha', block: 'alpha-text', text: expect.stringContaining('The first block of alpha') }) })
  await frame.locator('body').evaluate(() => document.getSelection()!.removeAllRanges())
  await message(page, 'selection', { selection: null })

  // The author's marks: the mark of a role without children shows while they are on.
  await expect(alpha.locator('.pm-role-mark')).toHaveCount(0)
  await send(page, 'marks', { on: true })
  await expect(alpha.locator('.pm-role-mark')).toHaveText('〔mark here〕')
  await send(page, 'marks', { on: false })
  await expect(alpha.locator('.pm-role-mark')).toHaveCount(0)

  // appearance: dark, and light again.
  await send(page, 'appearance', { dark: true })
  await expect(frame.locator('html')).toHaveClass(/\bdark\b/)
  await send(page, 'appearance', { dark: false })
  await expect(frame.locator('html')).not.toHaveClass(/\bdark\b/)

  // The source saved: the page shows the new IR and says its revision, that of `GET ir`.
  edit('Gamma closes the deck.', 'Gamma closes the deck, saved again.')
  await expect(frame.getByText('Gamma closes the deck, saved again.')).toBeVisible({ timeout: 30_000 })
  await expect.poll(revision).not.toBe((await received(page, 'ready'))[0]!.revision)
  await message(page, 'updated', { revision: await revision() })

  // The plugin whose setup throws.
  await message(page, 'report', { level: 'error', plugin: 'fixture.preview.throws', message: expect.stringContaining('fails to start on purpose') })
})

test('the slides take every command, report their position and picks with the trail, and leave a block a click has not shown', async ({ page }) => {
  await ready(page, 'slides', { renderer: 'slides', document: 'talk', revision: await revision(), capabilities: COMMANDS })
  const frame = page.frameLocator('#preview')
  const shown = frame.locator('.slidev-page').filter({ visible: true })
  await message(page, 'position', { section: 'preview-protocol', step: 0, trail: [] })

  // go to a section; the slide's section is the anchor of its title and blocks, as in the web form.
  await send(page, 'go', { section: 'beta' })
  await expect(shown.locator('[data-section="beta"]').getByRole('heading', { name: 'Beta' })).toBeVisible()
  await message(page, 'position', { section: 'beta', step: 0, trail: [] })
  const intro = shown.locator('[data-section="beta"] .pm-block[data-block="beta-intro"]')
  const step = shown.locator('[data-section="beta"] .pm-block[data-block="beta-step"]')

  // beta-step, at the slides' first click, is not shown yet: no pin beside it, no frame under the pointer, and a
  // click where it stands picks the section; the heading picks the section too.
  await send(page, 'pins', { targets: [{ id: 'one', section: 'beta', block: 'beta-intro', label: '1' }, { id: 'two', section: 'beta', block: 'beta-step', label: '2' }] })
  await expect(intro.locator('.pm-preview-pin')).toHaveText('1')
  await expect(step.locator('.pm-preview-pin')).toHaveCount(0)
  await send(page, 'pick', { on: true })
  await expect(async () => {
    await intro.hover()
    await expect(intro).toHaveAttribute('data-preview-hover', '', { timeout: 1000 })
  }).toPass()
  await step.hover({ force: true })
  await expect(intro).not.toHaveAttribute('data-preview-hover')
  await expect(step).not.toHaveAttribute('data-preview-hover')
  await shown.getByRole('heading', { name: 'Beta' }).click()
  expect(await next(page, 'picked', 0)).toEqual(expect.objectContaining({ type: 'picked', section: 'beta' }))
  await step.click({ force: true })
  const blank = await next(page, 'picked', 1)
  expect(blank).toMatchObject({ type: 'picked', section: 'beta' })
  expect(blank).not.toHaveProperty('block')
  await send(page, 'pick', { on: false })

  // A highlight of it brings its click in: the slides' step 1, the whole document's 2 (the trail says).
  await send(page, 'highlight', { target: { section: 'beta', block: 'beta-step' } })
  await expect(step).toHaveAttribute('data-preview-highlight', '')
  await message(page, 'position', { section: 'beta', step: 1, trail: ['beta-step'] })
  await expect(step.locator('.pm-preview-pin')).toHaveText('2')
  await send(page, 'highlight', { target: null })
  await expect(step).not.toHaveAttribute('data-preview-highlight')
  await send(page, 'pins', { targets: [] })
  await expect(frame.locator('.pm-preview-pin')).toHaveCount(0)

  // pick it now: the slides' step and the trail, from which a workbench finds the whole document's step.
  await send(page, 'pick', { on: true })
  await step.click()
  const whole = await beta()
  const picked = await next(page, 'picked', 2)
  expect(picked).toMatchObject({ section: 'beta', block: 'beta-step', step: 1, trail: ['beta-step'] })
  expect(trailStep(whole.keys, picked.trail as string[])).toBe(whole.step)
  expect(whole.step).toBe(2)
  await send(page, 'pick', { on: false })

  // go by the whole document's step and trail: the slides' own step.
  await send(page, 'go', { section: 'gamma' })
  await message(page, 'position', { section: 'gamma', step: 0, trail: [] })
  await send(page, 'go', { section: 'beta', step: whole.step, trail: stepTrail(whole.keys, whole.step) })
  await expect.poll(async () => (await received(page, 'position')).at(-1)).toMatchObject({ section: 'beta', step: 1, trail: ['beta-step'] })

  // The text selected, and none.
  await select(page, '.pm-block[data-block="beta-intro"] p')
  await message(page, 'selection', { selection: expect.objectContaining({ section: 'beta', block: 'beta-intro', text: expect.stringContaining('Beta starts with this block') }) })
  const nones = (await received(page, 'selection')).filter(m => m.selection === null).length
  await frame.locator('body').evaluate(() => document.getSelection()!.removeAllRanges())
  await expect.poll(async () => (await received(page, 'selection')).filter(m => m.selection === null).length).toBeGreaterThan(nones)

  // The author's marks, on the slide of alpha (a highlight brings its block's slide in).
  await send(page, 'highlight', { target: { section: 'alpha', block: 'alpha-text' } })
  await message(page, 'position', { section: 'alpha', step: 0 })
  const mark = frame.locator('.pm-block[data-block="alpha-text"] .pm-role-mark').filter({ visible: true })
  await expect(mark).toHaveCount(0)
  await send(page, 'marks', { on: true })
  await expect(mark).toHaveCount(1)
  expect(await mark.evaluate(element => getComputedStyle(element, '::before').content)).toBe('"〔mark here〕"')

  // appearance.
  await send(page, 'appearance', { dark: true })
  await expect(frame.locator('html')).toHaveClass(/\bdark\b/)
  await send(page, 'appearance', { dark: false })
  await expect(frame.locator('html')).not.toHaveClass(/\bdark\b/)

  // The source saved: the slides show it, and the page says the new revision.
  edit('Gamma closes the deck, saved again.', 'Gamma closes the slides.')
  await send(page, 'go', { section: 'gamma' })
  await expect(frame.getByText('Gamma closes the slides.').filter({ visible: true })).toBeVisible({ timeout: 30_000 })
  await message(page, 'updated', { revision: await revision() })

  await message(page, 'report', { level: 'error', plugin: 'fixture.preview.throws' })
})

test('the agent answers no other origin, no other nonce, and does not start out of a frame', async ({ page }) => {
  // A host of an origin the service does not allow: the page is not framed for it, and says nothing.
  await open(page, 'web', other)
  await page.waitForTimeout(5000)
  expect(await received(page, 'ready')).toEqual([])

  // The allowed host: a command with another nonce does nothing, nor one with its nonce from another window of its
  // origin (a frame beside the preview); from the host itself, it does.
  const nonce = await ready(page, 'web', { renderer: 'web' })
  const alpha = page.frameLocator('#preview').locator('.pm-block[data-block="alpha-text"]')
  const pins = { targets: [{ id: 'x', section: 'alpha', block: 'alpha-text', label: 'X' }] }
  await send(page, 'pins', pins, randomUUID())
  await page.evaluate(([fields, value]) => {
    const preview = (document.getElementById('preview') as HTMLIFrameElement)
    const sibling = document.createElement('iframe')
    document.body.append(sibling)
    // A script of the sibling's own window posts, so the message's source is that window.
    const script = sibling.contentDocument!.createElement('script')
    script.textContent = `parent.document.getElementById('preview').contentWindow.postMessage(${JSON.stringify({ protocol: 'presmium-preview', version: 1, nonce: value, type: 'pins', ...fields })}, ${JSON.stringify(new URL(preview.src).origin)})`
    sibling.contentDocument!.body.append(script)
  }, [pins, nonce] as const)
  await page.waitForTimeout(1000)
  await expect(alpha.locator('.pm-preview-pin')).toHaveCount(0)
  await send(page, 'pins', pins, nonce)
  await expect(alpha.locator('.pm-preview-pin')).toHaveText('X')

  // The host of the other origin, the frame-ancestors of the preview's page taken off on the way: the agent runs in
  // the frame, says nothing to that host and takes none of its commands.
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

  // The preview's page itself, with a nonce in its address but in no frame: no agent.
  const { web } = await route<{ web: string }>('preview?document=talk')
  await page.goto(`${web}?presmium-preview=${randomUUID()}`)
  await expect(page.locator('.pm-block[data-block="alpha-text"]')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  await expect(page.locator('html')).not.toHaveAttribute('data-presmium-preview')
  await expect(page.locator('#presmium-preview-style')).toHaveCount(0)
})
