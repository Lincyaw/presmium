import { resolve } from 'node:path'
import { DECK_ENTRY, findWorkspaceRoot, loadDeck, loadNodePlugins } from '@presmium/cli'
import type { Deck } from '@presmium/cli'
import { declaredLinks, normalizeUrl, parseRange } from '../domain/index.ts'
import { pdfLinks } from './pdf.ts'
import { run } from './process.ts'

/** Export job (P-50): a PDF of the deck, optionally one page per click step or a range of slides. */
export interface ExportJob {
  deckDir: string
  /** PDF path; defaults to `<exportFilename or slides-export>.pdf` in the deck directory. */
  output?: string
  withClicks?: boolean
  /** Slidev range such as `1,4-6`. */
  range?: string
  dark?: boolean
  timeout?: number
}

export interface ExportedLink {
  url: string
  /** First slide that declares the link. */
  slide: number
  source: { file: string, line: number }
  /** PDF pages that link to it; empty when the export lost the link. */
  pages: number[]
}

export interface ExportResult {
  output: string
  pages: number
  links: ExportedLink[]
  /** Addons or transforms that could not be applied while collecting links. */
  warnings: string[]
}

/** Runs `slidev export` to PDF, then checks that every link the slides declare is a link in the PDF. */
export async function exportDeck(job: ExportJob): Promise<ExportResult> {
  const deck = await loadDeck(job.deckDir)
  const warnings = deck.findings.map(f => f.message)
  const links = await expectedLinks(deck, parseRange(job.range), warnings)

  const name = job.output ?? resolve(deck.dir, String(deck.headmatter.exportFilename ?? 'slides-export'))
  const output = resolve(name.endsWith('.pdf') ? name : `${name}.pdf`)
  const args = ['export', DECK_ENTRY, '--format', 'pdf', '--output', output]
  if (job.withClicks) args.push('--with-clicks')
  if (job.range) args.push('--range', job.range)
  if (job.dark) args.push('--dark')
  if (job.timeout) args.push('--timeout', String(job.timeout))
  await run(deck.dir, 'slidev', args)

  const pages = (await pdfLinks(output)).map(uris => new Set(uris.map(normalizeUrl)))
  return {
    output,
    pages: pages.length,
    links: links.map(link => ({ ...link, pages: pages.flatMap((uris, i) => (uris.has(link.url) ? [i + 1] : [])) })),
    warnings,
  }
}

/** Links of the exported slides, after the addons' `transformMarkdown` (which generates e.g. code permalinks). */
async function expectedLinks(deck: Deck, range: Set<number> | undefined, warnings: string[]): Promise<Omit<ExportedLink, 'pages'>[]> {
  const { plugins, problems } = await loadNodePlugins(deck.dir, deck.headmatter.addons)
  warnings.push(...problems.map(p => p.message))
  const workspaceRoot = await findWorkspaceRoot(deck.dir)
  const links = new Map<string, Omit<ExportedLink, 'pages'>>()
  for (const slide of deck.slides) {
    if (slide.frontmatter.hide || slide.frontmatter.disabled || (range && !range.has(slide.index))) continue
    let content = slide.content
    for (const { plugin } of plugins) {
      if (!plugin.transformMarkdown) continue
      try {
        content = await plugin.transformMarkdown({
          content,
          file: slide.file,
          slide: slide.index,
          mode: 'slides',
          deckDir: deck.dir,
          workspaceRoot,
          headmatter: deck.headmatter,
          frontmatter: slide.frontmatter,
        })
      } catch (error) {
        warnings.push(`${plugin.id}: transformMarkdown failed on slide ${slide.index}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    for (const url of declaredLinks(content)) {
      if (!links.has(url)) links.set(url, { url, slide: slide.index, source: { file: slide.file, line: slide.line } })
    }
  }
  return [...links.values()]
}
