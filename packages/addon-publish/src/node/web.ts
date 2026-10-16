/**
 * The web round of `presmium-diff` (P-53): builds the web form of a
 * compilation, serves it on a local port under its public base
 * (`renderers.web.base`) and captures, with the Chromium of
 * `playwright-chromium` (which `slidev export` needs too, resolved from the
 * deck), every page in the document view (`<page>.png`, the whole page) and
 * every section in the present view (`present-<section>.png`).
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'

/** Content types of what a web build holds. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

/** A build directory served on a free local port under the public base it was built for (`/` or `/<path>/`), as a static host serves it. */
async function serve(dir: string, base: string): Promise<{ url: string, close(): Promise<void> }> {
  const root = resolve(dir)
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    let file = path.startsWith(base) ? join(root, path.slice(base.length)) : join(root, '404.html')
    if (!file.startsWith(root + sep) && file !== root) file = root
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    const found = existsSync(file)
    if (!found) file = join(root, '404.html')
    response.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise(done => server.close(() => done())),
  }
}

interface Chromium {
  launch(): Promise<{
    newPage(options: Record<string, unknown>): Promise<{
      goto(url: string, options: { waitUntil: 'networkidle' }): Promise<unknown>
      waitForSelector(selector: string): Promise<unknown>
      waitForTimeout(ms: number): Promise<void>
      screenshot(options: { path: string, fullPage?: boolean }): Promise<unknown>
    }>
    close(): Promise<void>
  }>
}

/** Playwright's Chromium as the deck has it for `slidev export`. */
async function chromium(deckDir: string): Promise<Chromium> {
  let entry: string
  try {
    entry = createRequire(join(deckDir, 'package.json')).resolve('playwright-chromium')
  } catch {
    throw new Error('the web form is captured with playwright-chromium, as `slidev export` uses it; install it in the deck')
  }
  return (await import(pathToFileURL(entry).href) as { chromium: Chromium }).chromium
}

/**
 * Builds the web form into `out` (removed afterwards) and captures it into
 * `dir`; returns warnings, e.g. when the deck has no web renderer installed.
 */
export async function captureWeb(compilation: Compilation, out: string, dir: string, wait: number): Promise<string[]> {
  await rm(out, { recursive: true, force: true })
  const report = await build(compilation, { outDir: out, to: ['web'] })
  const web = report.outputs.find(o => o.renderer === 'web')
  if (!web) return [`the web form was not built: ${report.findings.filter(f => f.severity === 'error').map(f => f.message).join('; ') || 'no web renderer'}`]
  await mkdir(dir, { recursive: true })
  const server = await serve(web.outDir, web.base)
  const site = `${server.url}${web.base}`
  const browser = await (await chromium(compilation.deckDir)).launch()
  try {
    // The same window, no service worker and no motion, so two builds of the same pages look the same.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    const pages = (await readdir(web.outDir)).filter(file => file.endsWith('.html') && file !== '404.html').sort()
    for (const file of pages) {
      await page.goto(`${site}${file}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.pm-section')
      await page.waitForTimeout(wait)
      await page.screenshot({ path: join(dir, `${file.slice(0, -'.html'.length)}.png`), fullPage: true })
    }
    for (const section of viewFor(compilation.doc, 'web').sections) {
      await page.goto(`${site}?view=present&section=${encodeURIComponent(section.id)}`, { waitUntil: 'networkidle' })
      await page.waitForSelector(`.pm-present[data-section=${JSON.stringify(section.id)}]`)
      await page.waitForTimeout(wait)
      await page.screenshot({ path: join(dir, `present-${section.id}.png`) })
    }
  } finally {
    await browser.close()
    await server.close()
    await rm(out, { recursive: true, force: true })
  }
  return report.findings.filter(f => f.severity !== 'info').map(f => f.message)
}
