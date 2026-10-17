/**
 * The preview and the source following each other in edit mode (P-124): the
 * IR's source positions say which lines of which file a block or a section
 * comes from. A block picked in the preview opens its file at its lines; the
 * cursor moving in the source shows the block it is in, on its page, marked.
 * The viewer is the IR runtime's, reached through the workspace's viewer
 * plugin (./viewer.ts); a page without it (the home page) has no preview.
 */
import { blockElement, blockKey } from '@presmium/host'
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, SourcePos } from '@presmium/kernel'
import type { Viewer } from '@presmium/viewer'
import type { ComputedRef } from 'vue'
import { computed, getCurrentInstance, shallowRef } from 'vue'

const access = shallowRef<() => Viewer>()

export function setViewerAccess(get: () => Viewer): void {
  access.value = get
}

/** The page's viewer, once the viewer plugins are installed; undefined where there is none. Must be called inside a component setup. */
export function usePreview(): ComputedRef<Viewer | undefined> {
  const app = getCurrentInstance()?.appContext.app
  return computed(() => {
    const get = access.value
    if (!get || !app) return undefined
    try {
      return app.runWithContext(get)
    } catch {
      return undefined
    }
  })
}

/** A place of the deck: a section, and a block of it (none for its heading), with its source. */
export interface Place {
  section: string
  block?: string
  source: SourcePos
}

/** The block holding `line` of `file` (relative to the deck), the innermost; else the section whose heading or span holds it. */
export function placeAt(doc: IRDocument, file: string, line: number): Place | undefined {
  let found: Place | undefined
  let span = Number.POSITIVE_INFINITY
  for (const section of doc.sections) {
    const places: Place[] = [{ section: section.id, source: section.source }, ...[...irBlocks(section.blocks)].map(block => ({ section: section.id, block: block.id, source: block.source }))]
    for (const place of places) {
      const { source } = place
      const end = source.endLine ?? source.line
      if (source.file !== file || line < source.line || line > end) continue
      if (end - source.line < span || (end - source.line === span && place.block)) {
        found = place
        span = end - source.line
      }
    }
  }
  return found
}

/** The place of a block or section in the IR, by their ids. */
export function placeOf(doc: IRDocument, section: string, block?: string): Place | undefined {
  const found = doc.sections.find(s => s.id === section)
  if (!found) return undefined
  if (!block) return { section, source: found.source }
  const inner = [...irBlocks(found.blocks)].find(b => b.id === block)
  return inner && { section, block, source: inner.source }
}

/** The element of a place on the page: the block the reader sees, else its section. Browser only. */
export function elementOf(place: Place): HTMLElement | undefined {
  if (place.block) {
    const block = blockElement(blockKey(place.section, place.block))
    if (block) return block
  }
  return document.querySelector<HTMLElement>(`.pm-section[data-section="${CSS.escape(place.section)}"]`) ?? undefined
}

/** The place a click on the page lands on: the block under it, else its section; none on a control or a link. */
export function placeOfClick(doc: IRDocument, event: MouseEvent): Place | undefined {
  const target = event.target instanceof Element ? event.target : undefined
  if (!target || event.button !== 0 || event.defaultPrevented) return undefined
  if (target.closest('a, button, input, select, textarea, label, summary, [contenteditable], [role="dialog"]')) return undefined
  // A selection is the reader's (an annotation, a question), not a pick.
  if (document.getSelection()?.isCollapsed === false) return undefined
  const section = target.closest<HTMLElement>('[data-section]')?.dataset.section
  if (!section) return undefined
  return placeOf(doc, section, target.closest<HTMLElement>('.pm-block[data-block]')?.dataset.block)
}

/** Whether an element is in the window, between the bars. */
export function inView(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect()
  return box.bottom > 64 && box.top < window.innerHeight - 48
}

/** The mark of the element picked: the accent around it, as the design draws it. */
let marked: HTMLElement | undefined
export function mark(element: HTMLElement | undefined): void {
  if (marked && marked !== element) {
    marked.style.removeProperty('outline')
    marked.style.removeProperty('outline-offset')
    marked.style.removeProperty('border-radius')
  }
  marked = element
  if (!element) return
  element.style.setProperty('outline', '2px solid var(--pm-color-accent)')
  element.style.setProperty('outline-offset', '4px')
  element.style.setProperty('border-radius', '2px')
}
