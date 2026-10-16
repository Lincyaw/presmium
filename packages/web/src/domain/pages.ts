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

/**
 * The pages of a translation (docs/ir.md 2.12): a chapter that opens with
 * the same section as a chapter of the original takes the path of that
 * chapter's page, so the language menu, which keeps the path, stays on the
 * chapter; other chapters keep their own path, unless the original's pages
 * hold it.
 */
export function translationPages(doc: IRDocument, original: readonly WebPage[]): WebPage[] {
  const pages = toPages(doc)
  const matched = pages.map(page => original.find(o => o.sections[0] === page.sections[0])?.path)
  const paths = new Set(matched.filter(path => path !== undefined))
  return pages.map((page, i) => {
    let path = matched[i]
    if (path === undefined) {
      path = page.path
      for (let n = 2; paths.has(path); n++) path = `${page.path}-${n}`
      paths.add(path)
    }
    return { ...page, path }
  })
}

/** Site-relative link of a page; `prefix` is the path of its locale, e.g. `/en` (docs/ir.md 2.12). */
export function pageLink(page: WebPage, prefix = ''): string {
  return page.path === 'index' ? `${prefix}/` : `${prefix}/${page.path}.html`
}

/** Site-relative link of each section: its page, and its anchor unless it opens the page. */
export function sectionLinks(pages: readonly WebPage[], prefix = ''): Record<string, string> {
  return Object.fromEntries(pages.flatMap(page => page.sections.map((id, i) =>
    [id, i === 0 ? pageLink(page, prefix) : `${pageLink(page, prefix)}#${encodeURIComponent(id)}`])))
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
export function sidebar(doc: IRDocument, pages: readonly WebPage[], prefix = ''): SidebarItem[] {
  const links = sectionLinks(pages, prefix)
  const titles = new Map(doc.sections.map(section => [section.id, section.title]))
  const chapters = pages.map((page): SidebarItem => {
    const items = page.sections.slice(1).map(id => ({ text: titles.get(id) ?? id, link: links[id]! }))
    return { text: page.title, link: pageLink(page, prefix), ...items.length ? { items } : {} }
  })
  return [{ items: chapters }]
}

/** The page whose Markdown file is `relativePath` (e.g. `core.md`). */
export function pageOf(pages: readonly WebPage[], relativePath: string): WebPage | undefined {
  const path = relativePath.replace(/\.md$/, '')
  return pages.find(page => page.path === path)
}

/** A link of the doc footer to the chapter before or after a page: in the same document, or in the one before or after it in a workspace site. */
export interface Neighbour {
  text: string
  link: string
}

/** The doc footer's link to a page of the same document and locale. */
export function neighbour(page: WebPage | undefined, prefix = ''): Neighbour | undefined {
  return page && { text: page.title, link: pageLink(page, prefix) }
}

/**
 * The VitePress Markdown file of a page: the IR runtime renders its body,
 * and the default theme's doc footer at its end links the chapters before
 * and after it (`prev`, `next`).
 */
export function pageMarkdown(page: WebPage, prev?: Neighbour, next?: Neighbour): string {
  const link = (other?: Neighbour) => (other ? JSON.stringify(other) : 'false')
  return ['---', `title: ${JSON.stringify(page.title)}`, 'outline: [2, 3]', `prev: ${link(prev)}`, `next: ${link(next)}`, '---', '', '<PresmiumPage />', ''].join('\n')
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

/**
 * The search documents of a document: each section's title and text, linked
 * under `base` (the site's, or that of a locale or of another document of a
 * workspace site) on its page of `pages`. `titles` come first among the
 * headings of every section (the title of another document of the site).
 */
export function searchDocuments(doc: IRDocument, base: string, pages: readonly WebPage[] = toPages(doc), titles: string[] = []): SearchDocument[] {
  return pages.flatMap((page) => {
    const path = page.path === 'index' ? '' : `${page.path}.html`
    return page.sections.flatMap(id => doc.sections.filter(s => s.id === id)).map((section, i) => ({
      id: `${base}${path}#${section.id}`,
      title: section.title,
      titles: [...titles, ...i === 0 ? [] : [page.title]],
      text: section.blocks.map(blockText).filter(Boolean).join('\n'),
    }))
  })
}
