import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPTURE_HOOK, CAPTURE_MAX_BOXES, CAPTURE_MAX_FRAMES, CAPTURE_MAX_HEIGHT, CAPTURE_MAX_OVERVIEW, CAPTURE_PARAM, CAPTURE_SHEET_SIZE, errorMessage, PREVIEW_APPEARANCE_PARAM, slideShape } from '@lincyaw/kernel'
import type { CapturedBox, CapturedSlide, CaptureHook, DocumentCapture, IRDocument } from '@lincyaw/kernel'
import { playwrightChromium } from '@lincyaw/kernel/node'

/** What capturing uses of Playwright's Chromium. */
interface Page {
  goto(url: string, options: { waitUntil: 'load', timeout: number }): Promise<unknown>
  waitForFunction(script: string, arg: undefined, options: { timeout: number }): Promise<unknown>
  evaluate<R, A>(run: (arg: A) => R | Promise<R>, arg: A): Promise<R>
  screenshot(options: { type: 'png', fullPage?: boolean, clip?: { x: number, y: number, width: number, height: number } }): Promise<Buffer>
  setViewportSize(size: { width: number, height: number }): Promise<void>
  setContent(html: string, options: { waitUntil: 'load', timeout: number }): Promise<void>
  on(event: 'pageerror', listener: (error: Error) => void): void
  on(event: 'console', listener: (message: { type(): string, text(): string }) => void): void
}
interface Context {
  newPage(): Promise<Page>
  close(): Promise<void>
}
interface Browser {
  newContext(options: { viewport: { width: number, height: number }, deviceScaleFactor: number, reducedMotion: 'reduce', colorScheme: 'light' | 'dark', serviceWorkers: 'block' }): Promise<Context>
  close(): Promise<void>
}
interface Chromium { launch(): Promise<Browser> }

export interface CaptureOptions {
  root: string
  /** The service's own address. */
  url(): string
  /** The viewer page of a document once the page can show it (its path below the address), as previews open it. */
  viewerPage(document: string): Promise<string | undefined>
  /** The document's current runtime snapshot. */
  compiled(document: string): Promise<IRDocument>
  /** Where the pictures are written. */
  dir: string
}

interface View { width: number, height: number, scale: number, appearance: 'light' | 'dark' }

const PAGE_MS = 120_000
const IDLE_MS = 120_000
const KEEP = 20
const FIT_ROUNDS = 3
const READING_WIDTH = 1280
const READING_HEIGHT = 900
const MIN_WIDTH = 320
const MAX_WIDTH = 2560
const THUMB_WIDTH = 320
const SHEET_GAP = 16

class CaptureError extends Error {
  readonly status: number
  readonly detail?: Record<string, unknown>
  constructor(code: string, status: number, detail?: Record<string, unknown>) {
    super(code)
    this.status = status
    if (detail) this.detail = detail
  }
}

/**
 * Pictures of documents as readers see them, in a headless Chromium kept while it is used: the viewer page of a
 * document, opened with `?capture`, is driven by its capture hook (a slide step by step and moment by moment, so that a
 * picture is the same however often it is taken; a section of the reading page scrolled through and at rest). One request
 * at a time; the pictures stay in `dir`, the last few requests.
 */
export function createDocumentCapture(options: CaptureOptions): { service: DocumentCapture, close(): Promise<void> } {
  let browser: Promise<Browser> | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  const launch = (): Promise<Browser> => {
    clearTimeout(idle)
    browser ??= playwrightChromium<Chromium>(options.root, import.meta.url).then(chromium => chromium.launch()).catch((error: unknown) => {
      browser = undefined
      throw new CaptureError('capture-browser-unavailable', 503, { reason: errorMessage(error) })
    })
    return browser
  }
  const release = () => {
    clearTimeout(idle)
    idle = setTimeout(() => void close(), IDLE_MS)
    idle.unref?.()
  }
  const close = async () => {
    clearTimeout(idle)
    const open = browser
    browser = undefined
    await (await open?.catch(() => undefined))?.close().catch(() => undefined)
  }

  /** The section asked for, by id or by its number from 1. */
  const sectionOf = (doc: IRDocument, asked: string) => {
    const section = doc.sections.find(s => s.id === asked) ?? doc.sections[Number(asked) - 1]
    if (!section) throw new CaptureError('capture-section-unknown', 404, { section: asked, sections: doc.sections.map(s => s.id) })
    return section
  }

  /** The document's viewer page in a form, opened with its capture hook in a new context; `run` uses it, then it closes. */
  const open = async <T>(document: string, form: 'web' | 'slides', view: View, signal: AbortSignal | undefined, run: (tab: Page, problems: Set<string>, out: string) => Promise<T>): Promise<T> => {
    const page = await options.viewerPage(document).catch((error: unknown) => {
      throw new CaptureError('capture-preview-failed', 409, { reason: errorMessage(error) })
    })
    if (!page) throw new CaptureError('capture-preview-failed', 409)
    signal?.throwIfAborted()
    const context = await (await launch()).newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.scale, reducedMotion: 'reduce', colorScheme: view.appearance, serviceWorkers: 'block' })
    const problems = new Set<string>()
    try {
      const tab = await context.newPage()
      tab.on('pageerror', error => problems.add(error.message))
      tab.on('console', message => { if (message.type() === 'error') problems.add(message.text().slice(0, 500)) })
      const address = new URL(page, options.url())
      if (form === 'slides') address.searchParams.set('form', 'slides')
      address.searchParams.set(CAPTURE_PARAM, '')
      address.searchParams.set(PREVIEW_APPEARANCE_PARAM, view.appearance)
      await tab.goto(address.href, { waitUntil: 'load', timeout: PAGE_MS })
      await tab.waitForFunction(`Boolean(window.${CAPTURE_HOOK})`, undefined, { timeout: PAGE_MS })
      const out = join(options.dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
      mkdirSync(out, { recursive: true })
      return await run(tab, problems, out)
    } catch (error) {
      if (error instanceof CaptureError || signal?.aborted) throw error
      // A page that loads again while it is driven loses its hook: going back reloaded it.
      if (/context was destroyed|because of a navigation/i.test(errorMessage(error))) throw new CaptureError('capture-page-reloaded', 409, { problems: [...problems] })
      throw new CaptureError('capture-failed', 500, { reason: errorMessage(error), problems: [...problems] })
    } finally {
      await context.close().catch(() => undefined)
      prune(options.dir)
    }
  }

  const slides: DocumentCapture['slides'] = async (document, request, signal) => {
    const doc = await options.compiled(document)
    const section = sectionOf(doc, request.section)
    const steps = request.steps ?? Array.from({ length: section.steps + 1 }, (_, step) => step)
    const wrong = steps.find(step => !Number.isInteger(step) || step < 0 || step > section.steps)
    if (wrong !== undefined) throw new CaptureError('capture-step-invalid', 400, { step: wrong, last: section.steps })
    const arrive = request.arrive ?? 'direct'
    // Reached backward, a step is at rest: moments apply to steps drawn directly.
    const moments: (number | null)[] = request.at?.length && arrive === 'direct' ? request.at : [null]
    if (moments.some(at => at !== null && (!Number.isFinite(at) || at < 0))) throw new CaptureError('capture-moment-invalid', 400)
    const count = steps.length * moments.length
    if (count === 0 || count > CAPTURE_MAX_FRAMES) throw new CaptureError('capture-too-many-frames', 400, { requested: count, max: CAPTURE_MAX_FRAMES })
    const shape = slideShape(doc)
    const scale = request.scale ?? 1
    return await open(document, 'slides', { width: shape.width, height: shape.height, scale, appearance: request.appearance ?? 'light' }, signal, async (tab, problems, out) => {
      const show = (step: number, at: number | null, how: 'direct' | 'backward' = 'direct') => tab.evaluate(async ([hook, position]) => await (window as unknown as Record<string, CaptureHook>)[hook]!.show(position), [CAPTURE_HOOK, { section: section.id, step, arrive: how, ...at === null ? {} : { at } }] as const)
      await fit(tab, shape, section.id, steps[0]!, () => show(steps[0]!, moments[0]!))
      const frames: CapturedSlide[] = [], images: Uint8Array[] = []
      for (const step of steps) {
        for (const at of moments) {
          signal?.throwIfAborted()
          const shown = await show(step, at, arrive)
          for (const problem of shown.problems) problems.add(problem)
          const measured = await tab.evaluate(measure, { section: section.id, step, selector: request.measure ?? '', width: shape.width, max: CAPTURE_MAX_BOXES })
          if (!measured) throw new CaptureError('capture-slide-missing', 500, { section: section.id, step })
          const clip = request.clip
            ? { x: measured.slide.x + request.clip.x * measured.slide.scale, y: measured.slide.y + request.clip.y * measured.slide.scale, width: request.clip.width * measured.slide.scale, height: request.clip.height * measured.slide.scale }
            : { x: measured.slide.x, y: measured.slide.y, width: measured.slide.width, height: measured.slide.height }
          const png = await tab.screenshot({ type: 'png', clip })
          const file = join(out, `${section.id}-${step}${at === null ? '' : `-${at}ms`}${arrive === 'backward' ? '-backward' : ''}.png`)
          writeFileSync(file, png)
          images.push(png)
          frames.push({ section: section.id, slide: section.index, step, at, file, width: Math.round(clip.width * scale), height: Math.round(clip.height * scale), ...request.measure ? { boxes: measured.boxes } : {} })
        }
      }
      return { document, shape: { width: shape.width, height: shape.height }, frames, problems: [...problems], images }
    })
  }

  const reading: DocumentCapture['reading'] = async (document, request, signal) => {
    const doc = await options.compiled(document)
    const section = sectionOf(doc, request.section)
    const width = Math.round(request.width ?? READING_WIDTH)
    if (!Number.isFinite(width) || width < MIN_WIDTH || width > MAX_WIDTH) throw new CaptureError('capture-width-invalid', 400, { min: MIN_WIDTH, max: MAX_WIDTH })
    const scale = request.scale ?? 1
    return await open(document, 'web', { width, height: READING_HEIGHT, scale, appearance: request.appearance ?? 'light' }, signal, async (tab, problems, out) => {
      const shown = await tab.evaluate(async ([hook, id]) => await (window as unknown as Record<string, CaptureHook>)[hook]!.read(id), [CAPTURE_HOOK, section.id] as const)
      for (const problem of shown.problems) problems.add(problem)
      const measured = await tab.evaluate(measureSection, { section: section.id, selector: request.measure ?? '', max: CAPTURE_MAX_BOXES })
      if (!measured) throw new CaptureError('capture-slide-missing', 500, { section: section.id })
      const height = Math.min(measured.height, CAPTURE_MAX_HEIGHT)
      const png = await tab.screenshot({ type: 'png', fullPage: true, clip: { x: measured.x, y: measured.y, width: measured.width, height } })
      const file = join(out, `${section.id}-reading-${width}.png`)
      writeFileSync(file, png)
      const frame = { section: section.id, file, width: Math.round(measured.width), height: Math.round(height), cut: measured.height > CAPTURE_MAX_HEIGHT, ...request.measure ? { boxes: measured.boxes } : {} }
      return { document, width, frames: [frame], problems: [...problems], images: [png] }
    })
  }

  const overview: DocumentCapture['overview'] = async (document, request, signal) => {
    const doc = await options.compiled(document)
    const every = request.steps === 'all'
    const positions = doc.sections.flatMap(section => (every ? Array.from({ length: section.steps + 1 }, (_, step) => step) : [section.steps]).map(step => ({ section, step })))
    if (positions.length === 0 || positions.length > CAPTURE_MAX_OVERVIEW) throw new CaptureError('capture-too-many-frames', 400, { requested: positions.length, max: CAPTURE_MAX_OVERVIEW })
    const shape = slideShape(doc)
    const appearance = request.appearance ?? 'light'
    const columns = Math.max(1, Math.min(8, Math.round(request.columns ?? 4)))
    return await open(document, 'slides', { width: shape.width, height: shape.height, scale: 1, appearance }, signal, async (tab, problems, out) => {
      const show = (section: string, step: number) => tab.evaluate(async ([hook, position]) => await (window as unknown as Record<string, CaptureHook>)[hook]!.show(position), [CAPTURE_HOOK, { section, step }] as const)
      const first = positions[0]!
      await fit(tab, shape, first.section.id, first.step, () => show(first.section.id, first.step))
      // Names that sort in reading order: the page number (from 1) and the step (from 0, as the tools count it) padded.
      const pageWidth = String(doc.sections.length).length
      const stepWidth = String(Math.max(...doc.sections.map(section => section.steps))).length
      const frames: { section: string, slide: number, step: number, file: string }[] = [], pictures: Buffer[] = []
      for (const { section, step } of positions) {
        signal?.throwIfAborted()
        for (const problem of (await show(section.id, step)).problems) problems.add(problem)
        const measured = await tab.evaluate(measure, { section: section.id, step, selector: '', width: shape.width, max: 0 })
        if (!measured) throw new CaptureError('capture-slide-missing', 500, { section: section.id, step })
        const png = await tab.screenshot({ type: 'png', clip: { x: measured.slide.x, y: measured.slide.y, width: measured.slide.width, height: measured.slide.height } })
        const file = join(out, `${String(section.index).padStart(pageWidth, '0')}-${String(step).padStart(stepWidth, '0')}-${section.id}.png`)
        writeFileSync(file, png)
        frames.push({ section: section.id, slide: section.index, step, file })
        pictures.push(png)
      }
      // Sheets of thumbnails, each labelled with its page, step and title, for reading the whole piece at a glance.
      const sheets: string[] = [], images: Uint8Array[] = []
      await tab.setViewportSize({ width: columns * (THUMB_WIDTH + SHEET_GAP) + SHEET_GAP, height: READING_HEIGHT })
      for (let start = 0; start < frames.length; start += CAPTURE_SHEET_SIZE) {
        signal?.throwIfAborted()
        const cells = frames.slice(start, start + CAPTURE_SHEET_SIZE).map((frame, i) => ({ label: `${frame.slide} · ${frame.step}  ${doc.sections[frame.slide - 1]?.title ?? ''}`, png: pictures[start + i]! }))
        await tab.setContent(sheetHtml(cells, columns, appearance), { waitUntil: 'load', timeout: PAGE_MS })
        const png = await tab.screenshot({ type: 'png', fullPage: true })
        const file = join(out, `sheet-${String(sheets.length + 1).padStart(2, '0')}.png`)
        writeFileSync(file, png)
        sheets.push(file)
        images.push(png)
      }
      return { document, dir: out, frames, sheets, problems: [...problems], images }
    })
  }

  /** One capture at a time; the browser closes when none came for a while. */
  const queued = <A extends unknown[], R>(run: (...args: A) => Promise<R>) => (...args: A): Promise<R> => {
    const next = queue.then(async () => {
      try {
        return await run(...args)
      } finally {
        release()
      }
    })
    queue = next.catch(() => undefined)
    return next
  }

  return {
    service: { slides: queued(slides), reading: queued(reading), overview: queued(overview) },
    close,
  }
}

/**
 * The page fits the slide in its window with a margin: the window is made that much larger, a few times, until the slide
 * shows at its own size.
 */
async function fit(tab: Page, shape: { width: number, height: number }, section: string, step: number, show: () => Promise<unknown>): Promise<void> {
  let viewport = { width: shape.width, height: shape.height }
  await show()
  for (let round = 0; round < FIT_ROUNDS; round++) {
    const fitted = await tab.evaluate(measure, { section, step, selector: '', width: shape.width, max: 0 })
    if (!fitted || Math.abs(fitted.slide.scale - 1) < 0.005) return
    viewport = { width: Math.round(viewport.width / fitted.slide.scale), height: Math.round(viewport.height / fitted.slide.scale) }
    await tab.setViewportSize(viewport)
    await show()
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`)

/** A sheet of thumbnails with their labels: plain HTML for the capturing browser, not a page of the product. */
function sheetHtml(cells: { label: string, png: Buffer }[], columns: number, appearance: 'light' | 'dark'): string {
  const [paper, ink, line] = appearance === 'dark' ? ['#161614', '#ece9e2', '#3a3833'] : ['#f7f5f0', '#1c1b19', '#e3ded3']
  return `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; padding: ${SHEET_GAP}px; background: ${paper}; color: ${ink}; font: 13px/1.4 system-ui, sans-serif; }
main { display: grid; grid-template-columns: repeat(${columns}, ${THUMB_WIDTH}px); gap: ${SHEET_GAP}px; }
figure { margin: 0; } img { display: block; width: ${THUMB_WIDTH}px; border: 1px solid ${line}; }
figcaption { margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style><main>${cells.map(cell => `<figure><img src="data:image/png;base64,${cell.png.toString('base64')}"><figcaption>${escapeHtml(cell.label)}</figcaption></figure>`).join('')}</main>`
}

/** In the page: the slide shown at the step, in viewport pixels, and the boxes of `selector` in it, in slide pixels. */
function measure({ section, step, selector, width, max }: { section: string, step: number, selector: string, width: number, max: number }): { slide: { x: number, y: number, width: number, height: number, scale: number }, boxes: CapturedBox[] } | undefined {
  const slides = [...document.querySelectorAll<HTMLElement>(`.pm-slide[data-section="${CSS.escape(section)}"]`)]
  const slide = slides.find(element => element.dataset.step === String(step) && element.getBoundingClientRect().width > 0) ?? slides.find(element => element.getBoundingClientRect().width > 0)
  if (!slide) return undefined
  const frame = slide.getBoundingClientRect()
  const scale = frame.width / width
  const round = (value: number) => Math.round(value * 10) / 10
  const boxes: CapturedBox[] = []
  if (selector) {
    for (const element of [...slide.querySelectorAll<HTMLElement>(selector)].slice(0, max)) {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const attributes: Record<string, string> = {}
      for (const attribute of element.attributes) if (attribute.name === 'id' || attribute.name === 'class' || attribute.name.startsWith('data-')) attributes[attribute.name] = attribute.value.slice(0, 200)
      boxes.push({
        x: round((box.left - frame.left) / scale),
        y: round((box.top - frame.top) / scale),
        width: round(box.width / scale),
        height: round(box.height / scale),
        visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0,
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        attributes,
      })
    }
  }
  return { slide: { x: frame.left, y: frame.top, width: frame.width, height: frame.height, scale }, boxes }
}

/** In the page: the section of the reading page, in page pixels, and the boxes of `selector` in it, relative to it. */
function measureSection({ section, selector, max }: { section: string, selector: string, max: number }): { x: number, y: number, width: number, height: number, boxes: CapturedBox[] } | undefined {
  const element = document.querySelector<HTMLElement>(`section.pm-section[data-section="${CSS.escape(section)}"]`)
  if (!element) return undefined
  const frame = element.getBoundingClientRect()
  const round = (value: number) => Math.round(value * 10) / 10
  const boxes: CapturedBox[] = []
  if (selector) {
    for (const node of [...element.querySelectorAll<HTMLElement>(selector)].slice(0, max)) {
      const box = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const attributes: Record<string, string> = {}
      for (const attribute of node.attributes) if (attribute.name === 'id' || attribute.name === 'class' || attribute.name.startsWith('data-')) attributes[attribute.name] = attribute.value.slice(0, 200)
      boxes.push({
        x: round(box.left - frame.left),
        y: round(box.top - frame.top),
        width: round(box.width),
        height: round(box.height),
        visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0,
        text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        attributes,
      })
    }
  }
  return { x: frame.left + window.scrollX, y: frame.top + window.scrollY, width: frame.width, height: frame.height, boxes }
}

/** Keeps the pictures of the last few requests. */
function prune(dir: string): void {
  try {
    const runs = readdirSync(dir).map(name => ({ path: join(dir, name), time: statSync(join(dir, name)).mtimeMs })).sort((a, b) => b.time - a.time)
    for (const run of runs.slice(KEEP)) rmSync(run.path, { recursive: true, force: true })
  } catch {}
}
