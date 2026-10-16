import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { viewFor } from '@presmium/compiler'
import type { IRDocument } from '@presmium/kernel'
import { linkLine, normalizeUrl, parseRange, slideLinks } from '../domain/index.ts'
import type { DeclaredLink } from '../domain/index.ts'
import { keepPages, pdfLinks } from './pdf.ts'
import { run } from './process.ts'
import { SLIDEV_ENTRY, slidesDeck } from './slides.ts'

/** The name of a page Slidev exports as PNG: `001.png`, `002-01.png` with clicks. */
const PAGE_IMAGE = /^\d+(?:-\d+)?\.png$/

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
 * Slidev deck it writes, then, for a PDF, checks that every link the slides
 * show is a link in the PDF.
 */
export async function exportDeck(job: ExportJob): Promise<ExportResult> {
  const format = job.format ?? 'pdf'
  const { compilation, dir, warnings } = await slidesDeck(job.deckDir)
  const filename = compilation.doc.config.renderers.slides?.exportFilename
  const name = job.output ? resolve(job.output) : resolve(compilation.deckDir, String(filename ?? 'slides-export'))
  const output = format === 'png' || name.endsWith('.pdf') ? name : `${name}.pdf`
  const args = ['export', SLIDEV_ENTRY, '--format', format, '--output', output]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  if (job.timeout) args.push('--timeout', String(job.timeout))
  // The images of an earlier export would stay beside the new ones.
  const images = async () => (existsSync(output) ? (await readdir(output)).filter(file => PAGE_IMAGE.test(file)) : [])
  if (format === 'png') await Promise.all((await images()).map(file => rm(join(output, file))))
  await run(dir, 'slidev', args)

  if (format === 'png') return { format, output, pages: (await images()).length, links: [], warnings }
  const range = parseRange(job.range)
  if (range) warnings.push(...await applyRange(output, compilation.doc, range, Boolean(job.withClicks)))
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
 * Slidev 53 prints a PDF in one piece with every slide, whatever the range
 * (its print page reads the range before the route has it); the pages of the
 * other slides are removed. The slide of each page follows from the slides
 * view: the slides shown (not hidden or disabled), one page each, or with
 * clicks one page per step. Returns a warning when the PDF does not have
 * those pages.
 */
async function applyRange(file: string, doc: IRDocument, range: Set<number>, withClicks: boolean): Promise<string[]> {
  const slides = viewFor(doc, 'slides').sections
    .filter(section => !section.hints.slides?.hide && !section.hints.slides?.disabled)
    .flatMap((section, i) => Array.from({ length: withClicks ? section.steps + 1 : 1 }, () => i + 1))
  const kept = slides.filter(slide => range.has(slide)).length
  const pages = (await pdfLinks(file)).length
  if (pages === slides.length && kept < pages) await keepPages(file, i => range.has(slides[i]!))
  else if (pages !== kept) return [`the PDF has ${pages} pages where the range has ${kept}; it is left as Slidev exported it`]
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
