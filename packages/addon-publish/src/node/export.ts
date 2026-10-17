import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { exportedSlides, linkLine, normalizeUrl, parseRange, slideLinks } from '../domain/index.ts'
import type { DeclaredLink } from '../domain/index.ts'
import { keepPages, pdfLinks } from './pdf.ts'
import { EXPORT_WAIT, incompleteExport, shownSlides, slidesDeck, slidevExport } from './slides.ts'

/**
 * Export job (P-50): the deck as PDF, the format whose links can be checked,
 * or as PNG images; optionally one page per click step or a range of slides.
 */
export interface ExportJob {
  deckDir: string
  /** Default `pdf`. */
  format?: 'pdf' | 'png'
  /**
   * The PDF file, or the directory of the PNG images; defaults to
   * `<renderers.slides.exportFilename or slides-export>` (`.pdf` for a PDF) in the deck directory.
   */
  output?: string
  withClicks?: boolean
  /** Slidev range such as `1,4-6`. */
  range?: string
  dark?: boolean
  /** Milliseconds the print page settles before it is captured (`slidev export --wait`); default `EXPORT_WAIT`. */
  wait?: number
  /** Milliseconds the print page may take to load (`slidev export --timeout`); default `EXPORT_TIMEOUT`. */
  timeout?: number
}

export interface ExportedLink {
  url: string
  /** First slide that shows the link. */
  slide: number
  /** Where the deck writes the link; the first line of its block when a plugin generates it (e.g. a code permalink). */
  source: { file: string, line: number }
  /** PDF pages that link to it; empty when the export lost the link. */
  pages: number[]
}

export interface ExportResult {
  format: 'pdf' | 'png'
  output: string
  /** PDF pages, or PNG images. */
  pages: number
  /** The links the slides show, each with the PDF pages that keep it; empty for PNG images, which hold no links. */
  links: ExportedLink[]
  /** Compile and render findings, and plugins that could not be loaded. */
  warnings: string[]
}

/**
 * Renders the deck with the slides renderer, runs `slidev export` on the
 * Slidev deck it writes (`slidevExport`), checks that it exported every page
 * of the slides, then, for a PDF, that every link the slides show is a link
 * in the PDF.
 */
export async function exportDeck(job: ExportJob): Promise<ExportResult> {
  const format = job.format ?? 'pdf'
  const deck = await slidesDeck(job.deckDir)
  const { compilation, warnings } = deck
  const filename = compilation.doc.config.renderers.slides?.exportFilename
  const name = job.output ? resolve(job.output) : resolve(compilation.deckDir, String(filename ?? 'slides-export'))
  const output = format === 'png' || name.endsWith('.pdf') ? name : `${name}.pdf`
  const images = await slidevExport(deck, { ...job, format, output })

  if (format === 'png') return { format, output, pages: images.length, links: [], warnings }
  const range = parseRange(job.range)
  warnings.push(...await checkPages(output, compilation, range, Boolean(job.withClicks), job.wait ?? EXPORT_WAIT))
  const links = await located(slideLinks(viewFor(compilation.doc, 'slides'), range))
  const pages = (await pdfLinks(output)).map(uris => new Set(uris.map(normalizeUrl)))
  return {
    format,
    output,
    pages: pages.length,
    links: links.map(link => ({ ...link, pages: pages.flatMap((uris, i) => (uris.has(link.url) ? [i + 1] : [])) })),
    warnings,
  }
}

/**
 * Checks that the PDF has a page for every slide it exports (`incompleteExport`)
 * and applies the range. Slidev 53 prints a PDF in one piece with every slide,
 * whatever the range (its print page reads the range before the route has
 * it); the pages of the other slides are removed. The slide of each page
 * follows from the slides view: the slides shown (not hidden or disabled),
 * one page each, or with clicks one page per step. A PDF that does not have
 * those pages fails the export (a slide that does not fit its page, a
 * component's steps the export did not show), rather than a range that
 * keeps other slides passing for it.
 */
async function checkPages(file: string, compilation: Compilation, range: Set<number> | undefined, withClicks: boolean, wait: number): Promise<string[]> {
  const pages = (await pdfLinks(file)).length
  const slides = exportedSlides(shownSlides(compilation), range).length
  if (pages < slides) throw incompleteExport(`printed ${pages} pages for the ${slides} slides exported`, wait)
  if (!range) return []
  const steps = viewFor(compilation.doc, 'slides').sections
    .filter(section => !section.hints.slides?.hide && !section.hints.slides?.disabled)
    .flatMap((section, i) => Array.from({ length: withClicks ? section.steps + 1 : 1 }, () => i + 1))
  const kept = steps.filter(slide => range.has(slide)).length
  if (pages === steps.length && kept < pages) await keepPages(file, i => range.has(steps[i]!))
  else if (pages !== kept) throw new Error(`the PDF has ${pages} pages where the range has ${kept} (${steps.length} for the whole deck); it cannot be cut to the range`)
  return []
}

/** Each link at the line of its block that writes it. */
async function located(links: DeclaredLink[]): Promise<Omit<ExportedLink, 'pages'>[]> {
  const sources = new Map<string, Promise<string[]>>()
  const linesOf = (file: string) => {
    if (!sources.has(file)) sources.set(file, readFile(file, 'utf8').then(text => text.split(/\r?\n/), () => []))
    return sources.get(file)!
  }
  return Promise.all(links.map(async ({ url, slide, source }) => {
    const line = linkLine(await linesOf(source.file), url, source.line, (source.endLine ?? source.line) + 1) ?? source.line
    return { url, slide, source: { file: source.file, line } }
  }))
}
