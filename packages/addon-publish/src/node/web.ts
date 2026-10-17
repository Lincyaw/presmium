/**
 * The web round of `presmium-diff` (P-53): builds the web form of a
 * compilation, serves it on a local port under its public base
 * (`renderers.web.base`, the compiler's `serveDirectory`) and captures, with
 * the Chromium of `playwright-chromium` (which `slidev export` needs too, as
 * the deck has it: the compiler's `playwrightChromium`), every page in the
 * document view (`<page>.png`, the whole page) and every section in the
 * present view (`present-<section>.png`).
 */
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { build, playwrightChromium, serveDirectory, viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'

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
  const server = await serveDirectory(web.outDir, { base: web.base })
  const site = `${server.url}${web.base}`
  const browser = await (await playwrightChromium<Chromium>(compilation.deckDir)).launch()
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
