// A real Studio and browser, with diagnostics attached before the first navigation.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { browserDiagnostics, diagnosticLog } from './lib/browser-diagnostics.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  document: { type: 'string' }, views: { type: 'string', default: 'document,present,document' },
  output: { type: 'string' }, timeout: { type: 'string', default: '45000' },
  headed: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
} })
if (values.help) {
  console.log(`Usage: pnpm debug:studio [workspace] [--document libraries] [--views document,present,document]
  --output <directory>  New evidence directory (default: .presmium/debug/<timestamp>)
  --timeout <ms>        Each view's ready timeout (default: 45000)
  --headed              Show the isolated Chromium window

Copies the workspace into an isolated Studio; leaves the original files and running services alone.
Without a workspace, uses a fresh copy of examples/gallery. Captures browser errors, console
warnings/errors, failed HTTP/network requests, slow requests, long tasks and service logs before
navigation. Saves events.jsonl, summary.json, diagnostics and screenshots on failure. Does not collect
request headers/bodies or cookies. Query strings and known launch tokens are removed from reports.`)
  process.exit(0)
}
if (positionals.length > 1) throw new Error('Supply at most one workspace')
const timeout = Number(values.timeout)
if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 300_000) throw new Error('--timeout must be 1000..300000 ms')
const views = values.views.split(',').map(view => view === 'slides' || view === 'video' ? 'present' : view)
const labels = { document: '文档', present: '放映' }
if (!views.length || views.some(view => !(view in labels))) throw new Error('--views takes document,present')
const directory = resolve(values.output ?? join(root, '.presmium/debug', new Date().toISOString().replace(/[:.]/g, '-')))
if (existsSync(directory)) throw new Error(`Evidence directory already exists: ${directory}`)
mkdirSync(directory, { recursive: true, mode: 0o700 })
const summary = { started: new Date().toISOString(), document: values.document ?? (positionals.length ? undefined : 'libraries'), views: [], complete: false }
const require = createRequire(join(root, 'package.json'))
const { createJiti } = createRequire(join(root, 'packages/compiler/package.json'))('jiti')
const { startStudio } = await createJiti(import.meta.url).import(join(root, 'e2e/fixtures/workbench/studio.ts'))
const { chromium, expect } = require('@playwright/test')
const log = diagnosticLog({ directory })
let studio, browser, capture, example, page, context
let serviceRest = ''
let hostRest = ''
let interrupted = false
const serviceOutput = text => {
  const lines = (serviceRest + text).split('\n')
  serviceRest = lines.pop()
  for (const line of lines) {
    log.record('backend.log', { source: 'workspace', message: line })
  }
}
const hostOutput = text => {
  const lines = (hostRest + text).split('\n')
  hostRest = lines.pop()
  for (const line of lines) log.record('backend.log', { source: 'host', message: line })
}
const stop = () => { interrupted = true; void browser?.close().catch(() => {}) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const save = () => writeFileSync(join(directory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 })

async function diagnostics() {
  if (!context || !studio) return
  for (const endpoint of ['diagnostics', 'jobs']) {
    try {
      const response = await context.request.get(new URL(`/api/presmium/${endpoint}?document=${encodeURIComponent(summary.document ?? '')}`, studio.web.launch).href, { timeout: 5000 })
      log.record(`backend.${endpoint}`, { status: response.status(), snapshot: response.ok() ? await response.json() : undefined })
    } catch (error) { log.record('diagnostics.unavailable', { endpoint, message: error.message }) }
  }
}

async function freePort() {
  const server = createServer()
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done) })
  const { port } = server.address()
  await new Promise(done => server.close(done))
  return port
}

try {
  let fixture = positionals[0] && resolve(positionals[0])
  if (!fixture) {
    example = mkdtempSync(join(tmpdir(), 'presmium-debug-example-'))
    execFileSync(process.execPath, [join(root, 'examples/gallery/try.mjs'), example], { stdio: 'ignore' })
    fixture = example
  }
  console.error(`Debug evidence: ${directory}`)
  studio = await startStudio({ port: await freePort(), prefix: 'debug-studio', fixture, isolateClient: true, onServiceOutput: serviceOutput })
  log.addSecrets([studio.service.token, ...new URL(studio.web.launch).searchParams.values()])
  hostOutput(studio.web.process.output())
  studio.web.process.child.stdout?.on('data', chunk => hostOutput(chunk.toString()))
  studio.web.process.child.stderr?.on('data', chunk => hostOutput(chunk.toString()))
  if (interrupted) throw new Error('Debug interrupted')
  browser = await chromium.launch({ headless: !values.headed })
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  capture = await browserDiagnostics(context, { directory, log })
  page = await context.newPage()
  page.setDefaultTimeout(timeout)
  capture.step('workbench.open')
  await studio.open(page)
  if (summary.document === undefined) {
    const first = page.locator('.pmw-home__card').first()
    await first.waitFor({ state: 'visible' })
    summary.document = await first.getAttribute('data-document')
  }
  // data-document is on the card itself.
  const open = page.locator(`.pmw-home__card[data-document=${JSON.stringify(summary.document)}] .pmw-home__open`)
  await open.waitFor({ state: 'visible' })
  capture.step('document.open')
  const openStarted = Date.now()
  await open.click()
  await page.locator('.pmw-preview[data-ready="true"]').waitFor({ state: 'visible', timeout })
  await page.frameLocator('.pmw-preview__frame').locator('.pm-section').first().waitFor({ state: 'visible', timeout })
  summary.openMs = Date.now() - openStarted
  capture.record('document.ready', { elapsedMs: summary.openMs })
  for (const [index, view] of views.entries()) {
    if (interrupted) throw new Error('Debug interrupted')
    const step = `${index + 1}-${view}`
    capture.step(step)
    const started = Date.now()
    const row = { view, state: 'waiting', phase: 'click' }
    const remaining = () => Math.max(1, timeout - (Date.now() - started))
    summary.views.push(row)
    try {
      const button = page.getByRole('toolbar', { name: '命令', exact: true }).getByRole('button', { name: labels[view], exact: true })
      if (await button.count() === 0) throw new Error(`This document does not offer the ${view} view`)
      await button.click({ timeout: remaining() })
      const selector = '.pmw-preview__frame[data-renderer="web"]'
      row.phase = 'handshake'
      await page.locator('.pmw-preview[data-ready="true"]').waitFor({ state: 'visible', timeout: remaining() })
      await page.locator(selector).waitFor({ state: 'visible', timeout: remaining() })
      row.handshakeMs = Date.now() - started
      row.phase = 'content'
      const content = page.frameLocator(selector).locator(view === 'present' ? '.pm-slide' : '.pm-section').first()
      await content.waitFor({ state: 'visible', timeout: remaining() })
      if (view === 'present') {
        const jobs = await context.request.get(new URL(`/api/presmium/jobs?document=${encodeURIComponent(summary.document ?? '')}`, studio.web.launch).href)
        const configured = jobs.ok() && (await jobs.json()).targets?.some(target => target.id === 'video')
        const player = page.frameLocator(selector).locator('.pm-lecture-player')
        if (configured || await player.count()) {
          row.phase = 'playback'
          await expect(player).toBeInViewport({ timeout: remaining() })
          const before = Number(await player.getAttribute('data-time'))
          await player.locator('.pm-lecture-player__play').click({ timeout: remaining() })
          await expect(player).toHaveAttribute('data-state', 'playing', { timeout: remaining() })
          await expect.poll(async () => Number(await player.getAttribute('data-time')), { timeout: remaining() }).toBeGreaterThan(before + 250)
          row.playbackAdvancedMs = Number(await player.getAttribute('data-time')) - before
          await player.locator('.pm-lecture-player__play').click({ timeout: remaining() })
          await expect(player).toHaveAttribute('data-state', 'paused', { timeout: remaining() })
        }
        row.unsaidNotice = await page.frameLocator(selector).locator('[data-unsaid]').count() > 0
      }
      row.state = 'ready'
      capture.record('preview.ready', { view, handshakeMs: row.handshakeMs, elapsedMs: Date.now() - started, ...row.unsaidNotice ? { unsaidNotice: true } : {} })
    } catch (error) {
      row.state = 'failed'
      row.error = capture.redact(error.message)
      capture.record('preview.failed', { view, phase: row.phase, message: error.message, elapsedMs: Date.now() - started })
      await capture.snapshot(page, step)
      process.exitCode = 1
    }
    row.elapsedMs = Date.now() - started
    await diagnostics()
    console.error(`${step}: ${row.state} (${row.elapsedMs} ms)`)
    save()
  }
  summary.complete = true
  await capture.snapshot(page, 'final')
} catch (error) {
  // Startup errors can include a host launch URL before the redactor knows its token.
  summary.failure = log.redact(error.message)
  log.record('debug.failed', { message: summary.failure })
  await diagnostics()
  if (page && capture && !page.isClosed()) await capture.snapshot(page, 'failure')
  console.error(summary.failure)
  process.exitCode = interrupted ? 130 : 1
} finally {
  for (const close of [() => browser?.close(), () => studio?.close()]) {
    try { await close() }
    catch (error) {
      log.record('cleanup.failed', { message: error.message })
      summary.complete = false
      process.exitCode ||= 1
    }
  }
  if (serviceRest) log.record('backend.log', { source: 'workspace', message: serviceRest })
  if (hostRest) log.record('backend.log', { source: 'host', message: hostRest })
  capture?.close()
  log.close()
  summary.evidence = log.summary()
  const counts = summary.evidence.counts
  summary.browserFailures = (counts['browser.error'] ?? 0) + (counts['browser.crash'] ?? 0) + (counts['http.error'] ?? 0) + (counts['request.failed'] ?? 0) + (counts['console.error'] ?? 0)
  if (summary.browserFailures) process.exitCode ||= 1
  summary.finished = new Date().toISOString()
  if (example) rmSync(example, { recursive: true, force: true })
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  save()
  for (const event of summary.evidence.problems.slice(0, 5)) console.error(`[${event.step}] ${event.kind}: ${event.message?.split('\n')[0] ?? `${event.status ?? ''} ${event.url ?? ''}`}`)
  console.error(`Report: ${join(directory, 'summary.json')}`)
}
