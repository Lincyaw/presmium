import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Compiler, exportDocument, viewFor } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { exportedSlides, linkLine, normalizeUrl, parseRange, slideLinks } from '../domain/index.ts'
import type { DeclaredLink } from '../domain/index.ts'
import { pdfLinks } from './pdf.ts'

export const EXPORT_TIMEOUT = 120_000

// The export's own directory below the deck's: the slides renderer's exporters write there.
const WORK = '.presmium/export'
const PAGE_IMAGE = /^\d+(?:-\d+)?\.png$/

export interface ExportJob {
  deckDir: string
  format?: 'pdf' | 'png' | 'pptx'
  output?: string
  withClicks?: boolean
  range?: string
  dark?: boolean
  timeout?: number
  log?: (line: string) => void
  signal?: AbortSignal
}

export interface ExportedLink {
  url: string
  slide: number
  source: { file: string, line: number }
  pages: number[]
}

export interface ExportResult {
  format: 'pdf' | 'png' | 'pptx'
  output: string
  pages: number
  links: ExportedLink[]
  warnings: string[]
}

/** The pages an export of the slides has: a slide each, or each of its steps with `withClicks`. */
function expectedPages(compilation: Compilation, range: Set<number> | undefined, withClicks: boolean): number {
  const sections = viewFor(compilation.doc, 'slides').sections
  return exportedSlides(sections.length, range).reduce((count, slide) => count + (withClicks ? sections[slide - 1]!.steps + 1 : 1), 0)
}

/** Exports the slides with the slides renderer's exporters (`pdf`, `png`, `pptx`) to `output`. */
export async function exportSlides(compilation: Compilation, job: ExportJob & { format: 'pdf' | 'png' | 'pptx', output: string }): Promise<string[]> {
  const range = parseRange(job.range)
  const work = join(compilation.deckDir, WORK)
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  try {
    const options = { steps: Boolean(job.withClicks), ...range ? { slides: [...range] } : {}, ...job.dark ? { dark: true } : {}, timeout: job.timeout ?? EXPORT_TIMEOUT }
    const { files } = await exportDocument(compilation, job.format, { outDir: work, options, ...job.log ? { log: job.log } : {}, ...job.signal ? { signal: job.signal } : {} })
    if (job.format !== 'png') {
      await cp(join(work, files[0]!), job.output)
      return [job.output]
    }
    await mkdir(job.output, { recursive: true })
    await Promise.all((await readdir(job.output)).filter(file => PAGE_IMAGE.test(file)).map(file => rm(join(job.output, file))))
    await Promise.all(files.map(file => cp(join(work, file), join(job.output, file))))
    return files
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export async function exportDeck(job: ExportJob): Promise<ExportResult> {
  const format = job.format ?? 'pdf'
  const compilation = await new Compiler(job.deckDir).compile()
  const warnings = compilation.doc.diagnostics.filter(f => f.severity !== 'info').map(f => f.message)
  const filename = compilation.doc.config.renderers.slides?.exportFilename
  const name = job.output ? resolve(job.output) : resolve(compilation.deckDir, String(filename ?? 'slides-export'))
  const output = format === 'png' || name.endsWith(`.${format}`) ? name : `${name}.${format}`
  const range = parseRange(job.range)
  const written = await exportSlides(compilation, { ...job, format, output })
  const expected = expectedPages(compilation, range, Boolean(job.withClicks))

  if (format === 'png') {
    if (written.length !== expected) throw new Error(`the export wrote ${written.length} pictures for the ${expected} pages of the slides`)
    return { format, output, pages: written.length, links: [], warnings }
  }
  // A PowerPoint file has a picture of each slide: no links to check.
  if (format === 'pptx') return { format, output, pages: expected, links: [], warnings }
  const pages = (await pdfLinks(output)).map(uris => new Set(uris.map(normalizeUrl)))
  if (pages.length !== expected) throw new Error(`the PDF has ${pages.length} pages for the ${expected} pages of the slides`)
  const links = await locateLinks(slideLinks(viewFor(compilation.doc, 'slides'), range))
  return {
    format,
    output,
    pages: pages.length,
    links: links.map(link => ({ ...link, pages: pages.flatMap((uris, i) => (uris.has(link.url) ? [i + 1] : [])) })),
    warnings,
  }
}

async function locateLinks(links: DeclaredLink[]): Promise<Omit<ExportedLink, 'pages'>[]> {
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
