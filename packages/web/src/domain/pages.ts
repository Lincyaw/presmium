import { blockText, chapters, isRecord, urlSlug } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'

export interface WebPage {
  path: string
  title: string
  sections: string[]
}

function baseName(file: string): string {
  return file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
}

/** A document is one web page with every section, as a static site shows each source file on one page. */
export function webPages(doc: IRDocument): WebPage[] {
  return [{ path: 'index', title: doc.meta.title, sections: doc.sections.map(section => section.id) }]
}

/**
 * The pages earlier sites split a document into, one per chapter: their addresses go on to the chapter's section on
 * the document's one page, so links to them keep working.
 */
export function chapterRedirects(doc: IRDocument): { path: string, section: string }[] {
  const web = doc.config.renderers.web
  if (isRecord(web) && web.layout === 'landing') return []
  const paths = new Set<string>()
  let file: string | undefined
  return chapters(doc).flatMap((chapter, i) => {
    const first = chapter.sections[0]!
    const name = i === 0 ? 'index' : urlSlug(first.source.file === file ? first.id : baseName(first.source.file)) || 'page'
    let path = name
    for (let n = 2; paths.has(path); n++) path = `${name}-${n}`
    paths.add(path)
    file = first.source.file
    return i === 0 ? [] : [{ path, section: first.id }]
  })
}

export function translationPages(doc: IRDocument, original: readonly WebPage[]): WebPage[] {
  const pages = webPages(doc)
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

export function pageLink(page: WebPage, prefix = ''): string {
  return page.path === 'index' ? `${prefix}/` : `${prefix}/${page.path}.html`
}

export function sectionLinks(pages: readonly WebPage[], prefix = ''): Record<string, string> {
  return Object.fromEntries(pages.flatMap(page => page.sections.map((id, i) =>
    [id, i === 0 ? pageLink(page, prefix) : `${pageLink(page, prefix)}#${encodeURIComponent(id)}`])))
}

/** A page of another document the pager goes on to. */
export interface Neighbour {
  text: string
  link: string
}

/** The fields of a document's search index (MiniSearch's), and those its results carry. */
export const SEARCH_FIELDS = { fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'] }

export interface SearchDocument {
  id: string
  title: string
  titles: string[]
  text: string
}

export function searchDocuments(doc: IRDocument, base: string, pages: readonly WebPage[] = webPages(doc), titles: string[] = []): SearchDocument[] {
  const byId = new Map(doc.sections.map(section => [section.id, section]))
  return pages.flatMap((page) => {
    const path = page.path === 'index' ? '' : `${page.path}.html`
    return page.sections.flatMap(id => byId.get(id) ?? []).map((section, i) => ({
      id: `${base}${path}#${section.id}`,
      title: section.title,
      titles: [...titles, ...i === 0 ? [] : [page.title]],
      text: section.blocks.map(blockText).filter(Boolean).join('\n'),
    }))
  })
}
