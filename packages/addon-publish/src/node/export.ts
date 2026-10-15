import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { viewFor } from '@presmium/compiler'
import { linkLine, normalizeUrl, parseRange, slideLinks } from '../domain/index.ts'
import type { DeclaredLink } from '../domain/index.ts'
import { pdfLinks } from './pdf.ts'
import { run } from './process.ts'
import { SLIDEV_ENTRY, slidesDeck } from './slides.ts'

/**
 * Export job (P-50): the deck as PDF, the format whose links can be checked,
 * optionally one page per click step or a range of slides.
 */
export interface ExportJob {
  deckDir: string
  /** PDF path; defaults to `<renderers.slides.exportFilename or slides-export>.pdf` in the deck directory. */
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
  output: string
  pages: number
  links: ExportedLink[]
  /** Compile and render findings, and plugins that could not be loaded. */
  warnings: string[]
}

/**
 * Renders the deck with the slides renderer, runs `slidev export` to PDF on
 * the Slidev deck it writes, then checks that every link the slides show is a
 * link in the PDF.
 */
export async function exportDeck(job: ExportJob): Promise<ExportResult> {
  const { compilation, dir, warnings } = await slidesDeck(job.deckDir)
  const links = await located(slideLinks(viewFor(compilation.doc, 'slides'), parseRange(job.range)))

  const filename = compilation.doc.config.renderers.slides?.exportFilename
  const name = job.output ? resolve(job.output) : resolve(compilation.deckDir, String(filename ?? 'slides-export'))
  const output = name.endsWith('.pdf') ? name : `${name}.pdf`
  const args = ['export', SLIDEV_ENTRY, '--format', 'pdf', '--output', output]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  if (job.timeout) args.push('--timeout', String(job.timeout))
  await run(dir, 'slidev', args)

  const pages = (await pdfLinks(output)).map(uris => new Set(uris.map(normalizeUrl)))
  return {
    output,
    pages: pages.length,
    links: links.map(link => ({ ...link, pages: pages.flatMap((uris, i) => (uris.has(link.url) ? [i + 1] : [])) })),
    warnings,
  }
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
