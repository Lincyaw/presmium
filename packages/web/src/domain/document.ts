import { sectionLayout, webOptions } from './config.ts'
import type { SectionLayout, WebOptions } from './config.ts'
import type { FormLink } from './links.ts'
import { demoteHeadings, downgrade, escapeAttr, firstHeading, sectionHeadings, slugify, splitNotes } from './markdown.ts'
import type { NoteSegment } from './markdown.ts'

/** One slide of the parsed deck, after the plugins' Markdown transforms. */
export interface SlideSource {
  /** 1-based slide number, as in the slides form. */
  index: number
  /** Absolute path of the file that contains the slide. */
  file: string
  frontmatter: Record<string, unknown>
  content: string
  note?: string
  /** Slidev's title of the slide (frontmatter `title` or first heading). */
  title?: string
}

export interface DeckSource {
  headmatter: Record<string, unknown>
  slides: SlideSource[]
}

/** A web section: exactly one per slide. */
export interface WebSection {
  slide: number
  title: string
  /** Stable anchor: the slide's `routeAlias` or `id`, else its title. */
  anchor: string
  layout: SectionLayout
  /** The slide's frontmatter `class`. */
  classes: string
  /** Downgraded Markdown, headed by `## <title> {#<anchor>}`. */
  content: string
  /** The notes as body text, split at click markers. */
  notes: NoteSegment[]
}

/** A VitePress page: the consecutive slides of one source file. */
export interface WebPage {
  /** Site path without extension; the first page is `index`. */
  path: string
  file: string
  title: string
  sections: WebSection[]
}

export interface WebDocument {
  title: string
  options: WebOptions
  pages: WebPage[]
}

function unique(name: string, used: Set<string>): string {
  let result = name
  for (let n = 2; used.has(result); n++) result = `${name}-${n}`
  used.add(result)
  return result
}

function pageName(file: string): string {
  const base = file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
  return slugify(base) || 'page'
}

function toSection(slide: SlideSource, headmatter: Record<string, unknown>, anchors: Set<string>): WebSection {
  const { frontmatter } = slide
  const title = firstHeading(slide.content) ?? slide.title ?? `第 ${slide.index} 页`
  const id = frontmatter.routeAlias ?? frontmatter.id
  const anchor = unique(slugify(String(id ?? title)) || `slide-${slide.index}`, anchors)
  return {
    slide: slide.index,
    title,
    anchor,
    layout: sectionLayout(frontmatter, headmatter),
    classes: typeof frontmatter.class === 'string' ? frontmatter.class : '',
    content: sectionHeadings(downgrade(slide.content), title, anchor),
    notes: splitNotes(slide.note).map(n => ({ step: n.step, markdown: demoteHeadings(downgrade(n.markdown), 2) })),
  }
}

/** Converts a parsed deck: one page per run of slides from the same file, one section per slide. */
export function toWebDocument(deck: DeckSource): WebDocument {
  const pages: WebPage[] = []
  const paths = new Set<string>()
  const anchors = new Map<WebPage, Set<string>>()
  for (const slide of deck.slides) {
    let page = pages.at(-1)
    if (!page || page.file !== slide.file) {
      page = { path: unique(pages.length === 0 ? 'index' : pageName(slide.file), paths), file: slide.file, title: '', sections: [] }
      pages.push(page)
      anchors.set(page, new Set())
    }
    page.sections.push(toSection(slide, deck.headmatter, anchors.get(page)!))
  }
  for (const page of pages) page.title = page.sections[0]!.title
  const title = typeof deck.headmatter.title === 'string' ? deck.headmatter.title : pages[0]?.title ?? 'Presmium'
  return { title, options: webOptions([deck.headmatter, ...deck.slides.map(s => s.frontmatter)]), pages }
}

function pageLink(page: WebPage): string {
  return page.path === 'index' ? '/' : `/${page.path}`
}

function anchorLink(page: WebPage, section: WebSection): string {
  return `${pageLink(page)}#${encodeURIComponent(section.anchor)}`
}

/** Slide number to section link, for switching between the forms. */
export function formLinks(doc: WebDocument): FormLink[] {
  return doc.pages.flatMap(page => page.sections.map(section => ({ slide: section.slide, link: anchorLink(page, section) })))
}

/** Sidebar entries: every section, in slide order. */
export function sidebar(doc: WebDocument): { text: string, link: string }[] {
  return doc.pages.flatMap(page => page.sections.map((section, i) => ({
    text: section.title,
    link: i === 0 ? pageLink(page) : anchorLink(page, section),
  })))
}

function renderSection(section: WebSection): string {
  const attrs = [`:slide="${section.slide}"`, `anchor="${escapeAttr(section.anchor)}"`, `layout="${section.layout}"`]
  if (section.classes) attrs.push(`class="${escapeAttr(section.classes)}"`)
  // Slidev's per-slide globals, given to the content by the section.
  attrs.push('v-slot="{ $page, $clicks }"')
  const notes = section.notes.length === 0
    ? []
    : ['<div class="pm-notes">', ...section.notes.flatMap(n => [`<div class="pm-step" data-step="${n.step}">`, '', n.markdown, '', '</div>']), '</div>']
  return [`<PmSection ${attrs.join(' ')}>`, '<div class="pm-slide">', '', section.content, '', '</div>', ...notes, '</PmSection>'].join('\n')
}

/** The VitePress Markdown of a page. */
export function renderPage(page: WebPage): string {
  const frontmatter = ['---', `title: ${JSON.stringify(page.title)}`, 'outline: [2, 3]', '---']
  return `${[frontmatter.join('\n'), ...page.sections.map(renderSection)].join('\n\n')}\n`
}
