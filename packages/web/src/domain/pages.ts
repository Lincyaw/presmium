import type { IRDocument, IRSection } from '@presmium/kernel'
import { blockText } from '@presmium/viewer/domain'

/** A VitePress page: a run of consecutive sections from the same source file. */
export interface WebPage {
  /** Site path without extension; the first page is `index`. */
  path: string
  title: string
  /** Ids of its sections, in order. */
  sections: string[]
}

function pageName(file: string): string {
  const base = file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
  return base.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'page'
}

/** Splits the document into pages: one per run of sections from the same source file. */
export function toPages(doc: IRDocument): WebPage[] {
  const pages: (WebPage & { file: string })[] = []
  const paths = new Set<string>()
  for (const section of doc.sections) {
    let page = pages.at(-1)
    if (!page || page.file !== section.source.file) {
      let path = pages.length === 0 ? 'index' : pageName(section.source.file)
      for (let n = 2; paths.has(path); n++) path = `${pageName(section.source.file)}-${n}`
      paths.add(path)
      page = { path, file: section.source.file, title: section.title, sections: [] }
      pages.push(page)
    }
    page.sections.push(section.id)
  }
  return pages.map(({ path, title, sections }) => ({ path, title, sections }))
}

/** Site-relative link of a page. */
export function pageLink(page: WebPage): string {
  return page.path === 'index' ? '/' : `/${page.path}.html`
}

/** Site-relative link of each section: its page, and its anchor unless it opens the page. */
export function sectionLinks(pages: readonly WebPage[]): Record<string, string> {
  return Object.fromEntries(pages.flatMap(page => page.sections.map((id, i) =>
    [id, i === 0 ? pageLink(page) : `${pageLink(page)}#${encodeURIComponent(id)}`])))
}

/** Sidebar entries: every section, in order. */
export function sidebar(doc: IRDocument, pages: readonly WebPage[]): { text: string, link: string }[] {
  const links = sectionLinks(pages)
  return doc.sections.map(section => ({ text: section.title, link: links[section.id]! }))
}

/** The page whose Markdown file is `relativePath` (e.g. `core.md`). */
export function pageOf(pages: readonly WebPage[], relativePath: string): WebPage | undefined {
  const path = relativePath.replace(/\.md$/, '')
  return pages.find(page => page.path === path)
}

/** The VitePress Markdown file of a page; the IR runtime renders its body. */
export function pageMarkdown(page: WebPage): string {
  // The doc footer steps through pages; sections have their own previous and next links.
  return ['---', `title: ${JSON.stringify(page.title)}`, 'outline: [2, 3]', 'prev: false', 'next: false', '---', '', '<PresmiumPage />', ''].join('\n')
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~&]/g, '\\$&')
}

function sectionSearchText(section: IRSection): string {
  const parts = section.blocks.map((block) => {
    const text = blockText(block)
    if (!text) return ''
    if (block.node.type === 'code') return `\`\`\`${block.node.lang}\n${text.replace(/`{3,}/g, m => m.replace(/`/g, '\\`'))}\n\`\`\``
    return text.split(/\n+/).map(escapeMarkdown).join('\n\n')
  })
  return [`## ${escapeMarkdown(section.title)} {#${section.id}}`, ...parts.filter(Boolean)].join('\n\n')
}

/**
 * The Markdown the search index sees for a page: each section as a heading
 * with its anchor, then the text of its blocks (narration, prose, code and
 * recorded output), from the IR rather than from the rendered page.
 */
export function searchMarkdown(doc: IRDocument, page: WebPage): string {
  return page.sections.flatMap(id => doc.sections.filter(s => s.id === id)).map(sectionSearchText).join('\n\n')
}

/** A document of the local search index: one per section, as VitePress indexes a page per heading. */
export interface SearchDocument {
  /** Link of the section: its page and its anchor. */
  id: string
  title: string
  /** Headings above the section; none, sections are the top headings of a page. */
  titles: string[]
  text: string
}

/** The search documents of a document: each section's title and text, linked under the site `base`. */
export function searchDocuments(doc: IRDocument, base: string): SearchDocument[] {
  return toPages(doc).flatMap((page) => {
    const path = page.path === 'index' ? '' : `${page.path}.html`
    return page.sections.flatMap(id => doc.sections.filter(s => s.id === id)).map(section => ({
      id: `${base}${path}#${section.id}`,
      title: section.title,
      titles: [],
      text: section.blocks.map(blockText).filter(Boolean).join('\n'),
    }))
  })
}
