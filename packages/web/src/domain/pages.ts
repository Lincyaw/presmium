import { blockText, chapters } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'

/** A VitePress page: one chapter of the document (see `chapters` of @presmium/kernel). */
export interface WebPage {
  /** Site path without extension; the first page is `index`. */
  path: string
  /** The chapter's title. */
  title: string
  /** Ids of its sections, in order; the first one opens the page. */
  sections: string[]
}

/** Letters and digits of any script, joined by '-'. */
function slug(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'page'
}

/** A source file's name without directory and extension. */
function baseName(file: string): string {
  return file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
}

/**
 * Splits the document into pages, one per chapter. A page is named after its
 * source file; a chapter that a chapter title opens further down the same
 * file is named after that section's id.
 */
export function toPages(doc: IRDocument): WebPage[] {
  const paths = new Set<string>()
  let file: string | undefined
  return chapters(doc).map((chapter, i) => {
    const first = chapter.sections[0]!
    const name = i === 0 ? 'index' : slug(first.source.file === file ? first.id : baseName(first.source.file))
    let path = name
    for (let n = 2; paths.has(path); n++) path = `${name}-${n}`
    paths.add(path)
    file = first.source.file
    return { path, title: chapter.title, sections: chapter.sections.map(section => section.id) }
  })
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

/** An entry of the sidebar of VitePress's default theme. */
export interface SidebarItem {
  text?: string
  link?: string
  items?: SidebarItem[]
}

/**
 * The sidebar in two levels: the chapters, each with its sections. The
 * section that opens a chapter is the chapter's own entry. The chapters
 * are the items of one group without a title, so the default theme shows
 * them as a tree (sections indented under their chapter) rather than as
 * separate groups.
 */
export function sidebar(doc: IRDocument, pages: readonly WebPage[]): SidebarItem[] {
  const links = sectionLinks(pages)
  const titles = new Map(doc.sections.map(section => [section.id, section.title]))
  const chapters = pages.map((page): SidebarItem => {
    const items = page.sections.slice(1).map(id => ({ text: titles.get(id) ?? id, link: links[id]! }))
    return { text: page.title, link: pageLink(page), ...items.length ? { items } : {} }
  })
  return [{ items: chapters }]
}

/** The page whose Markdown file is `relativePath` (e.g. `core.md`). */
export function pageOf(pages: readonly WebPage[], relativePath: string): WebPage | undefined {
  const path = relativePath.replace(/\.md$/, '')
  return pages.find(page => page.path === path)
}

/**
 * The VitePress Markdown file of a page: the IR runtime renders its body,
 * and the default theme's doc footer at its end links the chapters before
 * and after it (`prev`, `next`).
 */
export function pageMarkdown(page: WebPage, prev?: WebPage, next?: WebPage): string {
  const neighbour = (other?: WebPage) => (other ? JSON.stringify({ text: other.title, link: pageLink(other) }) : 'false')
  return ['---', `title: ${JSON.stringify(page.title)}`, 'outline: [2, 3]', `prev: ${neighbour(prev)}`, `next: ${neighbour(next)}`, '---', '', '<PresmiumPage />', ''].join('\n')
}

/** A document of the local search index: one per section, as VitePress indexes a page per heading. */
export interface SearchDocument {
  /** Link of the section: its page and its anchor. */
  id: string
  title: string
  /** Headings above the section: its chapter's title, unless the section opens the chapter. */
  titles: string[]
  text: string
}

/** The search documents of a document: each section's title and text, linked under the site `base`. */
export function searchDocuments(doc: IRDocument, base: string): SearchDocument[] {
  return toPages(doc).flatMap((page) => {
    const path = page.path === 'index' ? '' : `${page.path}.html`
    return page.sections.flatMap(id => doc.sections.filter(s => s.id === id)).map((section, i) => ({
      id: `${base}${path}#${section.id}`,
      title: section.title,
      titles: i === 0 ? [] : [page.title],
      text: section.blocks.map(blockText).filter(Boolean).join('\n'),
    }))
  })
}
