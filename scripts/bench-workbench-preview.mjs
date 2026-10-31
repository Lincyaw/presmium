// Run from any directory:
// node scripts/bench-workbench-preview.mjs [output.json] [--rounds 3]
// Two first opens, followed by `rounds` alternating returns in one isolated Studio.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { availableParallelism, arch, loadavg, platform, tmpdir, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rounds: { type: 'string', default: '3' },
    output: { type: 'string' },
    example: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log('Usage: node scripts/bench-workbench-preview.mjs [output.json] [--rounds 3] [--example]\n\nOpens two fixture lectures for the first time, then alternates between them for\nthree warm returns by default. --example uses the two lectures of the example\n(examples/gallery), with their animations. --output is an alternative to the positional path.\nUses one isolated Studio and Chromium; does not build the full demo or run tests.\nJSON goes to stdout when no output path is supplied. Progress goes to stderr.')
  process.exit(0)
}

const rounds = Number(values.rounds)
if (!Number.isSafeInteger(rounds) || rounds < 0 || !/^\d+$/.test(values.rounds)) throw new Error('--rounds must be a nonnegative integer')
if (positionals.length > 1 || (positionals.length > 0 && values.output)) throw new Error('Supply one output path, either positional or --output')
const output = values.output ?? positionals[0]
const outputPath = output ? resolve(output) : undefined
const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(root, 'package.json'))
const { createJiti } = createRequire(join(root, 'packages/compiler/package.json'))('jiti')
const jiti = createJiti(join(root, 'package.json'))
const { startStudio } = await jiti.import(join(root, 'e2e/fixtures/workbench/studio.ts'))
const { chromium } = require('@playwright/test')

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolvePort(port))
    })
  })
}

const result = {
  measuredAt: new Date().toISOString(),
  runtime: { node: process.version, platform: platform(), arch: arch(), logicalCpus: availableParallelism(), memoryBytes: totalmem() },
  rounds,
  fixture: values.example ? 'example' : 'workbench',
  // Each run has a fresh service state directory and a fresh browser context.
  // Later first opens still share the existing process and dependency caches.
  loadAtStart: loadavg(),
  boot: {},
  opens: [],
  pageErrors: [],
  complete: false,
}
let studio
let browser
let fixture
let interrupted = false

function message(error) {
  let text = error instanceof Error ? error.message : String(error)
  // Harness failures can contain captured launch output; never emit those logs.
  text = text.split('\n', 1)[0]
  if (studio) {
    text = text.replaceAll(studio.service.token, '[redacted]')
    for (const value of new URL(studio.web.launch).searchParams.values()) {
      if (value.length >= 8) text = text.replaceAll(value, '[redacted]')
    }
  }
  return text.replace(/([?&](?:token|key|secret|password|authorization)=)[^\s&#]+/gi, '$1[redacted]')
}

function save() {
  if (!outputPath) return
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
}

function stop() {
  interrupted = true
  // Closing Chromium interrupts an in-flight locator wait and reaches finally.
  // If Studio is still starting, cleanup follows as soon as its handle is ready.
  void browser?.close().catch(() => {})
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  const bootStarted = performance.now()
  if (values.example) {
    fixture = mkdtempSync(join(tmpdir(), 'presmium-bench-example-'))
    execFileSync(process.execPath, [join(root, 'examples/gallery/try.mjs'), fixture], { stdio: 'ignore' })
  }
  studio = await startStudio({ port: await freePort(), prefix: 'bench-preview', isolateClient: true, ...fixture ? { fixture } : {} })
  result.boot.studioReadyMs = performance.now() - bootStarted
  if (interrupted) throw new Error('Benchmark interrupted')
  const browserStarted = performance.now()
  browser = await chromium.launch({ headless: true })
  result.boot.browserLaunchMs = performance.now() - browserStarted
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  page.setDefaultTimeout(30_000)
  // Measure the actual browser click separately from Playwright's action/wait overhead.
  await page.addInitScript(() => {
    const sample = { clicked: 0, ready: 0 }
    Object.assign(window, { __previewBench: sample })
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('.pmw-home__open')) {
        sample.clicked = performance.now()
        sample.ready = 0
      }
    }, true)
    new MutationObserver(() => {
      if (!sample.clicked || sample.ready) return
      const preview = document.querySelector('.pmw-preview[data-ready="true"] .pmw-preview__frame')
      if (preview && !preview.hasAttribute('hidden') && preview.getBoundingClientRect().height > 0) sample.ready = performance.now()
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-ready', 'hidden'] })
  })
  page.on('pageerror', error => result.pageErrors.push(message(error)))

  let active
  page.on('request', request => {
    if (!active) return
    active.requests++
    const type = request.resourceType()
    active.requestTypes[type] = (active.requestTypes[type] ?? 0) + 1
  })
  page.on('requestfinished', () => {
    if (active) active.completedRequests++
  })
  page.on('requestfailed', () => {
    if (active) active.failedRequests++
  })

  const workbenchStarted = performance.now()
  await studio.open(page)
  await page.locator('.pmw-home__card').first().waitFor({ state: 'visible' })
  result.boot.workbenchOpenMs = performance.now() - workbenchStarted
  result.boot.totalMs = performance.now() - bootStarted
  console.error(`Studio and workbench ready: ${Math.round(result.boot.totalMs)} ms`)
  save()

  const titles = values.example ? ['冒泡排序', '代码写成的动画'] : ['分词入门', 'Second lecture']
  for (let index = 0; index < 2 + rounds; index++) {
    if (interrupted) throw new Error('Benchmark interrupted')
    if (await page.locator('.pmw-home__card:visible').count() === 0) await page.locator('[data-activity="documents"]').click()
    const title = titles[index % titles.length]
    const open = page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open')
    await open.waitFor({ state: 'visible' })
    const errorStart = result.pageErrors.length
    const row = {
      title,
      phase: index < 2 ? 'first-open' : 'warm-return',
      elapsedMs: undefined,
      requests: 0,
      completedRequests: 0,
      failedRequests: 0,
      requestTypes: {},
      loadBefore: loadavg(),
    }
    active = row
    const started = performance.now()
    await open.click()
    await page.locator('.pmw-preview[data-ready="true"]').waitFor({ state: 'visible', timeout: 90_000 })
    await page.frameLocator('.pmw-preview__frame').locator('.pm-section').first().waitFor({ state: 'visible', timeout: 30_000 })
    row.elapsedMs = performance.now() - started
    row.clickToReadyMs = await page.evaluate(() => {
      const { clicked, ready } = window.__previewBench
      return ready && clicked ? ready - clicked : null
    })
    active = undefined
    row.loadAfter = loadavg()
    row.pageErrors = result.pageErrors.slice(errorStart)
    result.opens.push(row)
    console.error(`${row.phase} ${title}: ${Math.round(row.elapsedMs)} ms, ${row.requests} requests`)
    save()
  }
  result.complete = true
} catch (error) {
  result.failure = interrupted ? 'Benchmark interrupted' : message(error)
  console.error(result.failure)
  process.exitCode = interrupted ? 130 : 1
} finally {
  for (const close of [() => browser?.close(), () => studio?.close()]) {
    try {
      await close()
    } catch (error) {
      result.cleanupErrors ??= []
      result.cleanupErrors.push(message(error))
      result.complete = false
      process.exitCode ||= 1
    }
  }
  result.loadAtEnd = loadavg()
  if (fixture) rmSync(fixture, { recursive: true, force: true })
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (outputPath) {
    save()
    console.error(`Measurements: ${outputPath}`)
  } else console.log(JSON.stringify(result, null, 2))
}
