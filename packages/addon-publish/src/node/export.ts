import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { viewFor } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { exportedSlides, linkLine, normalizeUrl, parseRange, slideLinks } from '../domain/index.ts'
import type { DeclaredLink } from '../domain/index.ts'
import { keepPages, pdfLinks } from './pdf.ts'
import { EXPORT_WAIT, incompleteExport, shownSlides, slidesDeck, slidevExport } from './slides.ts'

export interface ExportJob {
  deckDir: string
  format?: 'pdf' | 'png'
  output?: string
  withClicks?: boolean
  range?: string
  dark?: boolean
  wait?: number
  timeout?: number
}

export interface ExportedLink {
  url: string
  slide: number
  source: { file: string, line: number }
  pages: number[]
}

export interface ExportResult {
  format: 'pdf' | 'png'
  output: string
  pages: number
  links: ExportedLink[]
  warnings: string[]
}

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
