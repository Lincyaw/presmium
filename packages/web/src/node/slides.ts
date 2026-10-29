import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { PREVIEW_APPEARANCE_PARAM, slideShape } from '@lincyaw/kernel'
import type { IRDocument, Renderer, SlideShape } from '@lincyaw/kernel'
import send from 'send'
import { PRINTED_ATTRIBUTE, printQuery } from '../domain/index.ts'
import type { SlidesPrintQuery } from '../domain/index.ts'
import { devDocument } from './renderer.ts'
import { buildSlidesSite } from './site-build.ts'

/**
 * The slides form: the viewer app's slides page (its presentation, one slide at a time on a canvas of a fixed size), built
 * as the web form is, and served by the same dev server. The exports print it: the page lays every slide out at the
 * canvas's size (`?print`), and Chromium prints it to a PDF or takes a picture of each slide.
 */

const BUILD_DIR = '.presmium/slides/build'
const PRINT_TIMEOUT = 120_000
// The pictures are taken at twice the canvas's size, sharp on a projector.
const PICTURE_SCALE = 2

export const slidesRenderer: Renderer = {
  id: 'slides',
  site: true,
  support: () => 'full',
  async build(doc, ctx) {
    await buildSlidesSite(doc, { ...ctx, workDir: join(ctx.deckDir, BUILD_DIR) }, ctx.nodeVitePlugins ?? [])
    return { outDir: ctx.outDir, skipped: [] }
  },
  dev: (doc, ctx) => devDocument(doc, ctx, 'slides'),
}

interface PrintingPage {
  goto(url: string, options: { waitUntil: 'load', timeout: number }): Promise<unknown>
  waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>
  pdf(options: { path: string, width: string, height: string, printBackground: boolean }): Promise<unknown>
  $$(selector: string): Promise<{ screenshot(options: { path: string }): Promise<unknown> }[]>
  evaluate<T>(run: () => T): Promise<T>
}

/** What printing uses of Playwright's Chromium (`playwright-chromium`), which the caller loads. */
export interface PrintingChromium {
  launch(): Promise<{
    newPage(options: { viewport: SlideShape, deviceScaleFactor: number, reducedMotion: 'reduce', serviceWorkers: 'block' }): Promise<PrintingPage>
    close(): Promise<void>
  }>
}

export interface PrintOptions extends SlidesPrintQuery {
  /** The slides as `slidesRenderer` built them, for the root path. */
  dir: string
  chromium: PrintingChromium
  /** One PDF file, or a picture of each page in a directory. */
  format: 'pdf' | 'png'
  /** The PDF file, or the directory of the pictures. */
  output: string
  dark?: boolean
  /** How long the page may take to be ready, in milliseconds. */
  timeout?: number
  signal?: AbortSignal
}

/** A printed page: a slide (by number from 1) at a step, and its picture (`<slide>.png`, `<slide>-<step + 1>.png` with `steps`). */
export interface PrintedPage {
  section: string
  slide: number
  step: number
  file?: string
}

export interface Printed {
  shape: SlideShape
  pages: PrintedPage[]
}

/** Serves the built slides on a loopback port, through `send` (Express's): types and validators as HTTP defines them. */
async function serveBuilt(dir: string): Promise<{ url: string, close(): Promise<void> }> {
  const server = createServer((req, res) => {
    send(req, new URL(req.url ?? '/', 'http://localhost').pathname, { root: dir, dotfiles: 'allow' })
      .on('error', (error: { status?: number }) => res.writeHead(error.status ?? 500).end())
      .pipe(res)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

/** Prints the built slides: every slide (or `slides`) at its last step, or each of its steps with `steps`. */
export async function printSlides(options: PrintOptions): Promise<Printed> {
  const shape = slideShape(JSON.parse(await readFile(join(options.dir, 'ir.json'), 'utf8')) as IRDocument)
  const timeout = options.timeout ?? PRINT_TIMEOUT
  const server = await serveBuilt(options.dir)
  try {
    const browser = await options.chromium.launch()
    const stop = () => void browser.close()
    options.signal?.addEventListener('abort', stop, { once: true })
    try {
      options.signal?.throwIfAborted()
      const page = await browser.newPage({ viewport: shape, deviceScaleFactor: options.format === 'png' ? PICTURE_SCALE : 1, reducedMotion: 'reduce', serviceWorkers: 'block' })
      const query = `${printQuery(options)}&${PREVIEW_APPEARANCE_PARAM}=${options.dark ? 'dark' : 'light'}`
      await page.goto(`${server.url}/${query}`, { waitUntil: 'load', timeout })
      await page.waitForSelector(`html[${PRINTED_ATTRIBUTE}]`, { timeout })
      options.signal?.throwIfAborted()
      const pages: PrintedPage[] = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.pm-slides-print__page > .pm-slide')]
        .map(slide => ({ section: slide.dataset.section!, slide: Number(slide.dataset.slide), step: Number(slide.dataset.step) })))
      if (options.format === 'pdf') {
        await page.pdf({ path: options.output, width: `${shape.width}px`, height: `${shape.height}px`, printBackground: true })
        return { shape, pages }
      }
      const elements = await page.$$('.pm-slides-print__page')
      for (const [i, element] of elements.entries()) {
        options.signal?.throwIfAborted()
        const printed = pages[i]!
        printed.file = `${printed.slide}${options.steps ? `-${printed.step + 1}` : ''}.png`
        await element.screenshot({ path: join(options.output, printed.file) })
      }
      return { shape, pages }
    } catch (error) {
      options.signal?.throwIfAborted()
      throw error
    } finally {
      options.signal?.removeEventListener('abort', stop)
      await browser.close()
    }
  } finally {
    await server.close()
  }
}
