import { blockText, chapters } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'

export interface WebPage {
  path: string
  title: string
  sections: string[]
}

function slug(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'page'
}

function baseName(file: string): string {
  return file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
}

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

export function pageLink(page: WebPage, prefix = ''): string {
  return page.path === 'index' ? `${prefix}/` : `${prefix}/${page.path}.html`
}

export function sectionLinks(pages: readonly WebPage[], prefix = ''): Record<string, string> {
  return Object.fromEntries(pages.flatMap(page => page.sections.map((id, i) =>
    [id, i === 0 ? pageLink(page, prefix) : `${pageLink(page, prefix)}#${encodeURIComponent(id)}`])))
}

export interface SidebarItem {
  text?: string
  link?: string
  items?: SidebarItem[]
}

export function sidebar(doc: IRDocument, pages: readonly WebPage[], prefix = ''): SidebarItem[] {
  const links = sectionLinks(pages, prefix)
  const titles = new Map(doc.sections.map(section => [section.id, section.title]))
  const chapters = pages.map((page): SidebarItem => {
    const items = page.sections.slice(1).map(id => ({ text: titles.get(id) ?? id, link: links[id]! }))
    return { text: page.title, link: pageLink(page, prefix), ...items.length ? { items } : {} }
  })
  return [{ items: chapters }]
}

export function pageOf(pages: readonly WebPage[], relativePath: string): WebPage | undefined {
  const path = relativePath.replace(/\.md$/, '')
  return pages.find(page => page.path === path)
}

export interface Neighbour {
  text: string
  link: string
}

export function neighbour(page: WebPage | undefined, prefix = ''): Neighbour | undefined {
  return page && { text: page.title, link: pageLink(page, prefix) }
}

export function pageMarkdown(page: WebPage, prev?: Neighbour, next?: Neighbour): string {
  const link = (other?: Neighbour) => (other ? JSON.stringify(other) : 'false')
  return ['---', `title: ${JSON.stringify(page.title)}`, 'outline: [2, 3]', `prev: ${link(prev)}`, `next: ${link(next)}`, '---', '', '<PresmiumPage />', ''].join('\n')
}

export interface SearchDocument {
  id: string
  title: string
  titles: string[]
  text: string
}

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
