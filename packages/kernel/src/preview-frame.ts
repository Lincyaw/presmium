import type { PreviewEvents } from './preview-events.ts'
import { AUTHOR_MARKS_CLASS, PREVIEW_APPEARANCE_PARAM, PREVIEW_NAME, PREVIEW_PARAM, previewEnvelope, toPreviewCommand } from './contracts/preview.ts'
import type { PreviewAnchor, PreviewCommand, PreviewCommandType, PreviewPin, PreviewPoint, PreviewPosition, PreviewRect, PreviewReport } from './contracts/preview.ts'
import { errorMessage } from './errors.ts'
import { sameProductionBinding } from './contracts/production.ts'
import type { ProductionBinding, ProductionPlaybackCommand, ProductionPlaybackState } from './contracts/production.ts'

/** A source-bound native text draft, owned by the page rather than its DOM adapter. */
export interface PreviewTextEdit {
  target: PreviewAnchor
  before: string
  revision: string
  binding: string
}
export interface PreviewTextHandle {
  change(after: string, composing: boolean): void
  finish(after: string, interrupted?: boolean): void
  cancel(): void
}

/** What a web or slides page gives the preview frame: its position, navigation and DOM. */
export interface PreviewPage {
  renderer: 'web' | 'slides'
  events?: PreviewEvents
  confirmPresentation?(revision: string): void
  document: string
  origins: readonly string[]
  revision(): string | undefined
  position(): PreviewPosition | undefined
  go(command: Extract<PreviewCommand, { type: 'go' }>): void
  reveal(target: PreviewAnchor): void
  setDark(dark: boolean): void
  setActive?(active: boolean): void | Promise<void>
  activityChanged?(active: boolean): void
  /** Finishes only the page's own authored edits; the host confirms its source writes separately. */
  flush?(): void | Promise<void>
  documentHistory?(action: 'undo' | 'redo'): boolean
  resetDocumentHistory?(): void
  /** Visible editor tools that the embedding workbench should leave unobscured. */
  selectionTools?(): PreviewRect[]
  /** Present only when the page can retain text until a request-bound source acknowledgement. */
  nativeText?(edit: PreviewTextEdit): PreviewTextHandle | undefined
  pausePlayback?(): void | Promise<void>
  /** Installs author permission for a formal playback start; never owns a media clock. */
  setPlaybackGate?(authorize: (signal: AbortSignal) => Promise<void>): () => void
  productionPlayback?(command: ProductionPlaybackCommand, signal: AbortSignal): Promise<ProductionPlaybackState>
  subscribeProductionPlayback?(listener: (state: ProductionPlaybackState | undefined) => void): () => void
  sectionOf?(element: Element): string | undefined
  sectionElement?(section: string): HTMLElement | undefined
  seen?(element: Element): boolean
  stepOf?(anchor: Required<PreviewAnchor>): { step: number, trail: string[] } | undefined
}

export interface PreviewProblem {
  level: 'error' | 'warning'
  plugin?: string
  message: string
  resolved?: boolean
}

/** The page's side of the preview protocol, connected to the embedding workbench. */
export interface PreviewFrame {
  moved(): void
  updated(): void
  redraw(): void
  report(problem: PreviewProblem): void
  stop(): void
}

let editorReport: ((message: PreviewReport) => void) | undefined
/** Sends a typed editor operation through the authenticated connection of this preview. */
export function reportPreview(message: PreviewReport): void { editorReport?.(message) }

// A function, not a constant: bundlers keep a module-level template over an imported binding, and static builds must hold no preview code.
const framePrefix = () => `${PREVIEW_NAME}:`
const PAUSED = ':paused'
const STYLE_ID = 'presmium-preview-style'
const HIGHLIGHT = 'data-preview-highlight'
const HOVER = 'data-preview-hover'
const EDITING = 'data-preview-editing'
const POSITIONED = 'data-preview-positioned'
const PINNED = 'data-preview-pinned'
const PIN_LABELS = 'data-preview-pin-labels'
const FLASH = 'data-preview-flash'
// Three blinks of 0.8 s, the length of the animation below.
const FLASH_MS = 2400
const PIN_CLASS = 'pm-preview-pin'
const CONTROLS = 'a, button, input, select, textarea, label, summary, [role="dialog"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"]'
const HEADINGS = 'h1, h2, h3, h4, h5, h6'
// Inside an edited element: the frame's pins and a heading's anchor link, which the caret does not enter. A function for
// the same reason as `framePrefix`: a module-level template keeps this module in static builds.
const notText = () => `.${PIN_CLASS}, .header-anchor, .pm-content-marks`
const COMMANDS: PreviewCommandType[] = ['go', 'highlight', 'pick', 'pins', 'marks', 'appearance', 'edit', 'flash', 'blocks-result', 'source-result', 'source-saved', 'source-created', 'page-insert', 'page-created']

// A function for the same reason as `notText`.
const frameStyle = () => `
[${HIGHLIGHT}] { outline: var(--pm-size-stroke) solid var(--pm-color-accent) !important; outline-offset: calc(-1 * var(--pm-size-stroke)); border-radius: var(--pm-radius-control); }
[${HOVER}] { outline: var(--pm-size-hairline) solid color-mix(in srgb, var(--pm-color-accent) 50%, transparent) !important; outline-offset: calc(-1 * var(--pm-size-hairline)); border-radius: var(--pm-radius-control); cursor: pointer; }
[${EDITING}] { outline: var(--pm-size-stroke) solid var(--pm-color-accent) !important; outline-offset: calc(-1 * var(--pm-size-stroke)); border-radius: var(--pm-radius-control); cursor: text; }
[${POSITIONED}] { position: relative; }
[${PINNED}] { background: color-mix(in srgb, var(--pm-color-accent, #1d6b7a) 7%, transparent); box-shadow: inset 3px 0 0 var(--pm-color-accent, #1d6b7a); border-radius: 2px; }
@keyframes pm-preview-flash { 0%, 100% { box-shadow: none; } 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--pm-color-accent, #1d6b7a) 35%, transparent), inset 0 0 0 100vmax color-mix(in srgb, var(--pm-color-accent, #1d6b7a) 16%, transparent); } }
[${FLASH}] { animation: pm-preview-flash 0.8s ease-in-out 3; border-radius: 2px; }
@media (prefers-reduced-motion: reduce) { [${FLASH}] { animation: none; box-shadow: inset 0 0 0 100vmax color-mix(in srgb, var(--pm-color-accent, #1d6b7a) 12%, transparent); } }
.${PIN_CLASS} { position: absolute; top: 4px; right: 4px; z-index: 50; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px; background: var(--pm-color-accent, #1d6b7a); color: #fff; font: 600 12px/20px system-ui, sans-serif; text-align: center; pointer-events: none; }
[data-presmium-editor-block][${PIN_LABELS}] { box-sizing: border-box; padding-inline-end: calc(var(--pm-size-row) + var(--pm-space-2)); }
[data-presmium-editor-block][${PIN_LABELS}]::after { content: attr(${PIN_LABELS}); position: absolute; top: var(--pm-space-1); right: var(--pm-space-1); z-index: var(--pm-z-site-header); min-width: var(--pm-size-icon-lg); max-width: var(--pm-size-row); min-height: var(--pm-size-icon-lg); padding-inline: var(--pm-space-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; border-radius: var(--pm-radius-control); background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-family: var(--pm-font-sans); font-size: var(--pm-text-xs); font-weight: var(--pm-weight-semibold); line-height: var(--pm-size-icon-lg); text-align: center; pointer-events: none; }
`

export function previewNonce(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_PARAM)
  if (given) return given
  if (!window.name.startsWith(framePrefix())) return undefined
  const own = window.name.slice(framePrefix().length)
  return (own.endsWith(PAUSED) ? own.slice(0, -PAUSED.length) : own) || undefined
}

/** The appearance the workbench loaded the preview with, if it said. */
export function previewAppearance(): 'dark' | 'light' | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_APPEARANCE_PARAM)
  return given === 'dark' || given === 'light' ? given : undefined
}

/** The Content-Security-Policy that lets only the workbench's origins embed a preview page. */
export function previewFrameAncestors(origins: readonly string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(' ') : "'none'"}`
}

/** Whether the page is embedded by a workbench as its preview (the frame may still be refused when no origin is allowed). */
export function isPreviewEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window && previewNonce() !== undefined
}

export function isPreviewActive(): boolean {
  if (typeof window === 'undefined' || window.parent === window) return true
  const nonce = previewNonce()
  return !nonce || window.name !== `${framePrefix()}${nonce}${PAUSED}`
}

interface FrameState {
  active: boolean
  stopped: boolean
}

const isLive = (state: FrameState) => state.active && !state.stopped

/** Finds the sections and blocks the workbench names, among the elements a reader can see. */
function createLocator(page: PreviewPage) {
  const blocks = '.pm-block[data-block], [data-presmium-editor-block][data-block]'
  const seen = (element: Element): boolean =>
    !element.closest('[inert], .pm-hidden') && element.getClientRects().length > 0 && (page.seen?.(element) ?? true)
  const seenBlock = (element: Element): HTMLElement | undefined => {
    for (let block = element.closest<HTMLElement>(blocks); block; block = block.parentElement?.closest<HTMLElement>(blocks) ?? null) {
      if (seen(block)) return block
    }
    return undefined
  }
  const sectionOf = (element: Element): string | undefined =>
    element.closest<HTMLElement>('[data-section]')?.dataset.section ?? page.sectionOf?.(element)
  const blockElement = (section: string, block: string): HTMLElement | undefined => {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(`.pm-block[data-block="${CSS.escape(block)}"]`),
      ...document.querySelectorAll<HTMLElement>(`[data-presmium-editor-block][data-block="${CSS.escape(block)}"]`),
    ]
    for (const element of candidates) {
      if (sectionOf(element) === section && seen(element)) return element
    }
    return undefined
  }
  const sectionElement = (section: string): HTMLElement | undefined => {
    const own = page.sectionElement?.(section)
    if (own) return own
    const all = [...document.querySelectorAll<HTMLElement>(`[data-section="${CSS.escape(section)}"]`)]
    return all.find(el => el.classList.contains('pm-section') && seen(el)) ?? all.find(seen)
  }
  return {
    seen,
    seenBlock,
    blockElement,
    sectionElement,
    elementOf: (target: PreviewAnchor) => (target.block ? blockElement(target.section, target.block) : sectionElement(target.section)),
    anchorOf: (element: Element): PreviewAnchor | undefined => {
      const block = seenBlock(element)
      const section = sectionOf(block ?? element)
      if (!section) return undefined
      return block ? { section, block: block.dataset.block! } : { section }
    },
  }
}

type Locator = ReturnType<typeof createLocator>

const toRect = (box: DOMRect): PreviewRect => ({ x: box.x, y: box.y, width: box.width, height: box.height })
const isEmpty = (box: DOMRect) => box.width === 0 && box.height === 0

/** A range's bounding box, or its last line's box when the bounding box is empty. */
function rangeBox(range: Range): DOMRect | undefined {
  const box = range.getBoundingClientRect()
  if (!isEmpty(box)) return box
  const lines = range.getClientRects()
  return lines.length > 0 ? lines[lines.length - 1] : undefined
}

type Followed = { element: HTMLElement, anchor: PreviewAnchor } | { range: Range }

/**
 * Follows the picked block or the selected text while the page scrolls and resizes, so the workbench can keep its toolbar
 * beside it. After each scroll or resize it looks again every frame until the box stays put for two, since a page may lay
 * itself out again a frame later (the slides scale to the new size).
 */
function createRectReport(page: PreviewPage, state: FrameState, locate: Locator, post: (message: PreviewReport) => void) {
  let followed: Followed | undefined
  let sent: string | undefined
  let frame = 0
  let still = 0
  const box = (): DOMRect | undefined => {
    if (!followed) return undefined
    if ('range' in followed) return rangeBox(followed.range)
    const element = followed.element.isConnected ? followed.element : locate.elementOf(followed.anchor)
    if (!element) return undefined
    followed.element = element
    return element.getBoundingClientRect()
  }
  const send = () => {
    frame = 0
    if (!followed || !isLive(state)) return
    const found = box()
    const shown = found && !isEmpty(found) && found.bottom > 0 && found.right > 0 && found.top < window.innerHeight && found.left < window.innerWidth
    const rect = shown ? toRect(found) : null
    const obstacles = page.selectionTools?.().slice(0, 16) ?? []
    const key = JSON.stringify({ rect, obstacles })
    if (key === sent) still++
    else {
      still = 0
      sent = key
      post({ type: 'rect', rect, obstacles })
    }
    if (still < 2) frame = requestAnimationFrame(send)
  }
  const moved = () => {
    still = 0
    if (followed && !frame && isLive(state)) frame = requestAnimationFrame(send)
  }
  window.addEventListener('scroll', moved, { capture: true, passive: true })
  window.addEventListener('resize', moved, { passive: true })
  const cancel = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }
  return {
    moved,
    /** Follows a target from now on; `rect` is the box its pick or selection already reported. */
    follow(next: Followed, rect: PreviewRect | undefined) {
      followed = next
      sent = JSON.stringify({ rect: rect ?? null, obstacles: page.selectionTools?.().slice(0, 16) ?? [] })
      moved()
    },
    /** Stops following the selection when it is gone; a picked block stays followed. */
    unselected() {
      if (!followed || !('range' in followed)) return
      followed = undefined
      cancel()
    },
    cancel,
    stop() {
      window.removeEventListener('scroll', moved, { capture: true })
      window.removeEventListener('resize', moved)
      cancel()
    },
  }
}

type RectReport = ReturnType<typeof createRectReport>

/** Outlines the block or section the workbench points at; retries while the page brings it into view. */
function createHighlight(page: PreviewPage, state: FrameState, locate: Locator) {
  let target: PreviewAnchor | null = null
  let retrying: ReturnType<typeof setTimeout> | undefined
  const draw = (scroll: boolean) => {
    const element = target && locate.elementOf(target)
    for (const other of document.querySelectorAll(`[${HIGHLIGHT}]`)) if (other !== element) other.removeAttribute(HIGHLIGHT)
    if (!element) return false
    element.setAttribute(HIGHLIGHT, '')
    if (scroll) {
      const box = element.getBoundingClientRect()
      if (box.bottom < 0 || box.top > window.innerHeight) element.scrollIntoView({ block: 'center' })
    }
    return true
  }
  const show = (next: PreviewAnchor | null) => {
    clearTimeout(retrying)
    target = next
    if (!isLive(state)) return
    if (!next) return void draw(false)
    if (draw(true)) return
    page.reveal(next)
    const until = Date.now() + 5000
    const retry = () => {
      retrying = undefined
      if (!isLive(state) || target !== next || draw(true) || Date.now() > until) return
      retrying = setTimeout(retry, 100)
    }
    retrying = setTimeout(retry, 50)
  }
  return {
    draw,
    show,
    isSet: () => target !== null,
    cancel: () => clearTimeout(retrying),
  }
}

/**
 * Makes the blocks the workbench names blink (a steady tint when the reader asks for less motion), after bringing the first
 * into view; retries while the page brings it there, as the highlight does.
 */
function createFlash(page: PreviewPage, state: FrameState, locate: Locator) {
  let ending: ReturnType<typeof setTimeout> | undefined
  let retrying: ReturnType<typeof setTimeout> | undefined
  let frame = 0
  const clear = () => {
    clearTimeout(ending)
    cancelAnimationFrame(frame)
    for (const element of document.querySelectorAll(`[${FLASH}]`)) element.removeAttribute(FLASH)
  }
  const play = (targets: PreviewAnchor[]): boolean => {
    const first = locate.elementOf(targets[0]!)
    if (!first) return false
    clear()
    const box = first.getBoundingClientRect()
    if (box.bottom < 0 || box.top > window.innerHeight) first.scrollIntoView({ block: 'center' })
    const elements = targets.map(target => locate.elementOf(target)).filter((element): element is HTMLElement => Boolean(element))
    // A frame after the old attributes went, so that a block still blinking starts again.
    frame = requestAnimationFrame(() => {
      for (const element of elements) element.setAttribute(FLASH, '')
      ending = setTimeout(clear, FLASH_MS)
    })
    return true
  }
  return {
    flash(targets: PreviewAnchor[]) {
      clearTimeout(retrying)
      if (!isLive(state) || targets.length === 0 || play(targets)) return
      page.reveal(targets[0]!)
      const until = Date.now() + 5000
      const retry = () => {
        retrying = undefined
        if (!isLive(state) || play(targets) || Date.now() > until) return
        retrying = setTimeout(retry, 100)
      }
      retrying = setTimeout(retry, 50)
    },
    cancel() {
      clearTimeout(retrying)
      clear()
    },
  }
}

/** Numbered badges on the blocks that carry the workbench's annotations. */
function createPins(locate: Locator) {
  let pins: PreviewPin[] = []
  const draw = () => {
    const wanted = new Map<HTMLElement, PreviewPin[]>()
    for (const pin of pins) {
      const element = locate.blockElement(pin.section, pin.block)
      if (element) wanted.set(element, [...wanted.get(element) ?? [], pin])
    }
    for (const old of document.querySelectorAll<HTMLElement>(`.${PIN_CLASS}`)) {
      const host = old.parentElement
      if (!host || !wanted.get(host)?.some(pin => pin.id === old.dataset.pin && pin.label === old.textContent)) old.remove()
    }
    for (const host of document.querySelectorAll<HTMLElement>(`[${POSITIONED}], [${PINNED}]`)) {
      if (!wanted.has(host)) {
        host.removeAttribute(POSITIONED)
        host.removeAttribute(PINNED)
        host.removeAttribute(PIN_LABELS)
      }
    }
    for (const [element, own] of wanted) {
      element.setAttribute(PINNED, '')
      if (getComputedStyle(element).position === 'static') element.setAttribute(POSITIONED, '')
      if (element.hasAttribute('data-presmium-editor-block')) {
        // Child DOM belongs to BlockNote. Appending a badge there is parsed as
        // author input by ProseMirror; a CSS label cannot enter the document.
        element.setAttribute(PIN_LABELS, own.map(pin => pin.label).join(' · '))
        continue
      }
      own.forEach((pin, i) => {
        if ([...element.children].some(child => child.classList.contains(PIN_CLASS) && (child as HTMLElement).dataset.pin === pin.id)) return
        const mark = document.createElement('span')
        mark.className = PIN_CLASS
        mark.dataset.pin = pin.id
        mark.textContent = pin.label
        mark.setAttribute('aria-hidden', 'true')
        if (i > 0) mark.style.right = `${4 + 24 * i}px`
        element.append(mark)
      })
    }
  }
  return {
    draw,
    set(next: PreviewPin[]) {
      pins = next
      draw()
    },
    isEmpty: () => pins.length === 0,
  }
}

/**
 * While picking, hovering outlines a block and a click reports it, where it is and where the mouse was, instead of acting on
 * the page; a double click reports a second click and selects no word.
 */
function createPicking(page: PreviewPage, state: FrameState, locate: Locator, rects: RectReport, post: (message: PreviewReport) => void) {
  let picking = false
  let hovered: Element | undefined
  const pickable = (target: EventTarget | null): Element | undefined => {
    if (!(target instanceof Element) || target.closest(CONTROLS)) return undefined
    // A BlockNote text surface owns its editing. An opaque NodeView explicitly
    // closes that boundary and can still use the source-preserving text lens.
    const editable = target.closest('[contenteditable]')
    return editable && editable.getAttribute('contenteditable') !== 'false' ? undefined : target
  }
  const clearHover = () => {
    hovered?.removeAttribute(HOVER)
    hovered = undefined
  }
  const hover = (event: MouseEvent) => {
    if (!isLive(state)) return
    const target = pickable(event.target)
    const block = target ? locate.seenBlock(target) : undefined
    if (block === hovered) return
    hovered?.removeAttribute(HOVER)
    hovered = block
    hovered?.setAttribute(HOVER, '')
  }
  const press = (event: MouseEvent) => {
    if (!isLive(state) || event.button !== 0 || event.detail < 2) return
    const target = pickable(event.target)
    if (target && locate.anchorOf(target)) event.preventDefault()
  }
  const click = (event: MouseEvent) => {
    if (!isLive(state)) return
    const content = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-content-step]') : null
    if (content && event.button === 0) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const section = content.dataset.contentSection, step = Number(content.dataset.contentStep)
      if (section && Number.isSafeInteger(step) && step >= 0) page.go({ type: 'go', section, step })
      return
    }
    const mark = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-narration-step]') : null
    if (mark && event.button === 0) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      post({ type: 'narrate', section: mark.dataset.narrationSection!, step: Number(mark.dataset.narrationStep) })
      return
    }
    const target = pickable(event.target)
    if (!target || event.button !== 0) return
    if (event.detail < 2 && document.getSelection()?.isCollapsed === false) return
    const anchor = locate.anchorOf(target)
    if (!anchor) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const element = locate.seenBlock(target) ?? locate.sectionElement(anchor.section)
    const box = element?.getBoundingClientRect()
    const rect = box && toRect(box)
    const at = anchor.block ? page.stepOf?.({ section: anchor.section, block: anchor.block }) : undefined
    const clicks = Math.min(3, Math.max(1, event.detail))
    post({ type: 'picked', ...anchor, ...at ? { step: at.step, trail: at.trail } : {}, ...rect ? { rect } : {}, point: { x: event.clientX, y: event.clientY }, clicks })
    if (element) rects.follow({ element, anchor }, rect)
  }
  return {
    clearHover,
    set(on: boolean) {
      if (on === picking) return
      picking = on
      document.documentElement.toggleAttribute('data-preview-picking', on)
      if (on) {
        document.addEventListener('mouseover', hover, true)
        document.addEventListener('mousedown', press, true)
        document.addEventListener('click', click, true)
        return
      }
      document.removeEventListener('mouseover', hover, true)
      document.removeEventListener('mousedown', press, true)
      document.removeEventListener('click', click, true)
      clearHover()
    },
  }
}

type Picking = ReturnType<typeof createPicking>

interface Edited {
  target: PreviewAnchor
  element: HTMLElement
  html: string
  before: string
  after: string
  native?: PreviewTextHandle
  attributes: [string, string | null][]
  closed: HTMLElement[]
  changes: MutationObserver
  records: MutationRecord[]
  composing: boolean
  finishAfterComposition?: boolean
}

/**
 * The text of an edited element, without the frame's pins. Non-breaking spaces read as spaces: a browser types one for a
 * space that would otherwise collapse (at the end of the text), which the source should not get.
 */
function textOf(element: HTMLElement): string {
  let value = ''
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node instanceof Element && node.matches(notText()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node instanceof Text) value += node.data
  return value.replaceAll(' ', ' ')
}

/** Where the caret goes: under the point when that lies in the element's text, else after its last character. */
function caretIn(element: HTMLElement, at: PreviewPoint | undefined): Range {
  const inText = (node: Node) => element.contains(node) && !(node instanceof Element ? node : node.parentElement)?.closest(notText())
  if (at) {
    let range: Range | undefined
    if (typeof document.caretPositionFromPoint === 'function') {
      const caret = document.caretPositionFromPoint(at.x, at.y)
      if (caret) {
        range = document.createRange()
        range.setStart(caret.offsetNode, caret.offset)
      }
    } else range = document.caretRangeFromPoint?.(at.x, at.y) ?? undefined
    if (range && inText(range.startContainer)) return range
  }
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let last: Text | undefined
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node instanceof Text && node.data.trim() && inText(node)) last = node
  if (last) range.setStart(last, last.data.trimEnd().length)
  else {
    range.selectNodeContents(element)
    range.collapse(false)
  }
  return range
}

/** Puts back what the browser changed in an element, in reverse, so the page's own nodes (those its framework holds) stay. */
function undoChanges(records: MutationRecord[]): void {
  for (const record of [...records].reverse()) {
    if (record.type === 'characterData') {
      (record.target as CharacterData).data = record.oldValue ?? ''
      continue
    }
    for (const node of record.addedNodes) if (node.parentNode === record.target) record.target.removeChild(node)
    for (const node of record.removedNodes) record.target.insertBefore(node, record.nextSibling?.parentNode === record.target ? record.nextSibling : null)
  }
}

/**
 * Edits a block's text, or a section's heading, in place, as a word processor would: only plain text, Enter keeps it and
 * Escape puts the text back; the page's own keys do not see the keys typed into it.
 */
function createEditing(page: PreviewPage, state: FrameState, locate: Locator, picking: Picking, post: (message: PreviewReport) => void) {
  let current: Edited | undefined
  const waiting = new Set<() => void>()
  const changed = () => { for (const check of [...waiting]) check() }
  const editable = (target: PreviewAnchor): HTMLElement | undefined => {
    if (target.block) return locate.blockElement(target.section, target.block)
    const section = locate.sectionElement(target.section)
    return section && [...section.querySelectorAll<HTMLElement>(HEADINGS)].find(locate.seen)
  }
  const inside = (target: EventTarget | null) => current !== undefined && target instanceof Node && current.element.contains(target)
  const keys = (event: KeyboardEvent) => {
    if (!inside(event.target)) return
    event.stopImmediatePropagation()
    if (event.type !== 'keydown' || event.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  }
  const input = (event: InputEvent) => {
    if (event.inputType.startsWith('format') || event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') event.preventDefault()
  }
  const capture = () => {
    if (!current) return
    current.after = textOf(current.element)
    current.native?.change(current.after, current.composing)
  }
  const paste = (event: ClipboardEvent) => {
    event.preventDefault()
    const value = event.clipboardData?.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ') ?? ''
    if (!value || document.execCommand('insertText', false, value)) return
    const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : undefined
    if (!range || !inside(range.startContainer)) return
    range.deleteContents()
    const text = document.createTextNode(value)
    range.insertNode(text)
    range.setStartAfter(text)
    range.collapse(true)
    capture()
  }
  const drop = (event: DragEvent) => event.preventDefault()
  const leave = (event: FocusEvent) => {
    if (!inside(event.relatedTarget)) finish(true)
  }
  const composition = (event: CompositionEvent) => {
    if (!current || !inside(event.target)) return
    const edited = current
    edited.composing = event.type === 'compositionstart'
    capture()
    if (!edited.composing) queueMicrotask(() => {
      if (current === edited) capture()
      if (current === edited && edited.finishAfterComposition) finish(true)
      else changed()
    })
  }
  const listen = (element: HTMLElement, on: boolean) => {
    const method = on ? 'addEventListener' : 'removeEventListener'
    for (const type of ['keydown', 'keyup', 'keypress'] as const) window[method](type, keys as EventListener, true)
    element[method]('beforeinput', input as EventListener)
    element[method]('input', capture)
    element[method]('paste', paste as EventListener)
    element[method]('drop', drop as EventListener)
    element[method]('focusout', leave as EventListener)
    element[method]('compositionstart', composition as EventListener)
    element[method]('compositionend', composition as EventListener)
  }
  const place = (element: HTMLElement, at: PreviewPoint | undefined) => {
    element.focus({ preventScroll: true })
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(caretIn(element, at))
  }
  /** Ends editing: keeps the text and reports it when it changed and `keep`, else puts the page's nodes back. */
  const finish = (keep: boolean, interrupt = false) => {
    const edited = current
    if (!edited) return
    if (keep && edited.composing && !interrupt) {
      edited.finishAfterComposition = true
      return
    }
    current = undefined
    const { element, target, before } = edited
    listen(element, false)
    const records = [...edited.records, ...edited.changes.takeRecords()]
    edited.changes.disconnect()
    // Framework re-renders are not author input. The input event records the
    // draft before an unrelated IR update can replace this element's text.
    const after = edited.native ? edited.after : textOf(element)
    element.removeAttribute(EDITING)
    for (const [name, value] of edited.attributes) {
      if (value === null) element.removeAttribute(name)
      else element.setAttribute(name, value)
    }
    for (const closed of edited.closed) closed.removeAttribute('contenteditable')
    if (edited.native) {
      if (keep) edited.native.finish(after, interrupt && edited.composing)
      else edited.native.cancel()
    }
    if (keep && after !== before && !edited.native) post({ type: 'edited', target, before, after })
    else {
      // A source-bound page retains unconfirmed text in its recovery field.
      // Its rich document DOM updates only from the confirmed IR, so discarding
      // a draft never has to reconstruct source formatting from plain text.
      undoChanges(records)
      if (element.innerHTML !== edited.html) element.innerHTML = edited.html
    }
    if (document.activeElement === element) element.blur()
    post({ type: 'editing', target, active: false })
    changed()
  }
  const start = (command: Extract<PreviewCommand, { type: 'edit' }> & { target: PreviewAnchor }) => {
    const { target, at } = command
    if (current && current.target.section === target.section && current.target.block === target.block) {
      if (at) place(current.element, at)
      return post({ type: 'editing', target, active: true })
    }
    finish(true)
    if (current) return post({ type: 'editing', target, active: false })
    // A binding for a newer source must never authorize edits against stale
    // rendered text. Once started, unrelated source changes are checked by the
    // target binding at write time rather than this document-wide revision.
    if (command.revision !== undefined && command.revision !== page.revision()) return post({ type: 'editing', target, active: false })
    const element = editable(target)
    if (!element) return post({ type: 'editing', target, active: false })
    if (element.hasAttribute('data-presmium-editor-block') && element.isContentEditable) {
      // This text already has a BlockNote editor. Focus its existing cursor
      // instead of installing a second native editor and a second save path.
      element.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true })
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(caretIn(element, at))
      return post({ type: 'editing', target, active: false })
    }
    picking.clearHover()
    const html = element.innerHTML
    const before = textOf(element)
    const bound = page.nativeText && command.revision !== undefined && command.binding !== undefined
    const native = bound ? page.nativeText!({ target, before, revision: command.revision!, binding: command.binding! }) : undefined
    if (bound && !native) return post({ type: 'editing', target, active: false })
    const closed = [...element.querySelectorAll<HTMLElement>(notText())].filter(child => !child.hasAttribute('contenteditable'))
    for (const child of closed) child.setAttribute('contenteditable', 'false')
    const records: MutationRecord[] = []
    const changes = new MutationObserver(found => void records.push(...found))
    current = {
      target,
      element,
      html,
      before,
      after: before,
      native,
      attributes: ['contenteditable', 'spellcheck'].map(name => [name, element.getAttribute(name)]),
      closed,
      changes,
      records,
      composing: false,
    }
    element.setAttribute('contenteditable', 'true')
    element.setAttribute('spellcheck', 'false')
    element.setAttribute(EDITING, '')
    changes.observe(element, { childList: true, characterData: true, characterDataOldValue: true, subtree: true })
    listen(element, true)
    place(element, at)
    post({ type: 'editing', target, active: true })
  }
  return {
    isEditing: () => current !== undefined,
    flush(): Promise<void> {
      return new Promise((resolve, reject) => {
        let done = false
        const finishWait = (error?: string) => {
          if (done) return
          done = true
          clearTimeout(timeout)
          waiting.delete(check)
          if (error) reject(new Error(error))
          else resolve()
        }
        const check = () => {
          if (!isLive(state)) return finishWait('preview-flush-unavailable')
          if (current?.composing) return
          finish(true)
          finishWait()
        }
        const timeout = setTimeout(() => finishWait('save-timeout'), 30_000)
        waiting.add(check)
        check()
      })
    },
    edit(command: Extract<PreviewCommand, { type: 'edit' }>) {
      if (!isLive(state)) return
      if (command.target) start({ ...command, target: command.target })
      else finish(false)
    },
    /** Keeps an edit whose element the page took away. */
    redraw() {
      if (current && !current.element.isConnected) finish(true)
    },
    cancel: () => finish(false),
    preserve: () => finish(true, true),
  }
}

/** Reports the text the reader selects, with the block or section it lies in and where it is; not the text being edited. */
function watchSelection(page: PreviewPage, state: FrameState, locate: Locator, rects: RectReport, isEditing: () => boolean, post: (message: PreviewReport) => void) {
  let selected = false
  let settling: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    clearTimeout(settling)
    if (!isLive(state) || isEditing()) return
    settling = setTimeout(() => {
      if (!isLive(state) || isEditing()) return
      const range = document.getSelection()
      const value = range && !range.isCollapsed ? range.toString().trim() : ''
      const node = range?.rangeCount ? range.getRangeAt(0).commonAncestorContainer : undefined
      const element = node instanceof Element ? node : node?.parentElement
      const selectionRange = range?.rangeCount ? range.getRangeAt(0) : undefined
      const editor = element?.closest('[contenteditable="true"]')
      const pending = Boolean(selectionRange && [...document.querySelectorAll('[data-comment-pending]')].some(node => selectionRange.intersectsNode(node)))
      const source = value && element && !element.closest('input, textarea') && !pending
        && (!editor || element.closest('[data-presmium-editor-block]')) ? element : undefined
      const anchor = source ? locate.anchorOf(source) : undefined
      if (anchor) {
        selected = true
        const own = range!.getRangeAt(0).cloneRange()
        const box = rangeBox(own)
        const rect = box && toRect(box)
        post({ type: 'selection', selection: { ...anchor, text: value.slice(0, 4000), ...rect ? { rect } : {}, obstacles: page.selectionTools?.().slice(0, 16) ?? [] } })
        rects.follow({ range: own }, rect)
      } else if (selected) {
        selected = false
        post({ type: 'selection', selection: null })
        rects.unselected()
      }
    }, 200)
  }
  document.addEventListener('selectionchange', changed)
  return {
    cancel: () => clearTimeout(settling),
    stop() {
      document.removeEventListener('selectionchange', changed)
      clearTimeout(settling)
    },
  }
}

/** Sends `ready` once, then the page's position whenever it changes, at most every 150 ms. */
function createPositionReport(page: PreviewPage, state: FrameState, post: (message: PreviewReport) => void, capabilities: PreviewCommandType[]) {
  let ready = false
  let revision: string | undefined
  let sent: string | undefined
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const waiting: Extract<PreviewReport, { type: 'report' }>[] = []
  const send = () => {
    timer = undefined
    if (state.stopped) return
    if (!ready) {
      ready = true
      revision = page.revision()
      post({ type: 'ready', renderer: page.renderer, document: page.document, ...revision ? { revision } : {}, capabilities, ...page.events ? { eventConnection: page.events.connection } : {} })
      page.activityChanged?.(state.active)
    }
    if (!state.active) return
    for (const problem of waiting.splice(0)) post(problem)
    const position = page.position()
    if (!position) return
    const key = JSON.stringify(position)
    if (key === sent) return
    sent = key
    last = Date.now()
    post({ type: 'position', ...position })
  }
  return {
    flush() { clearTimeout(timer); send() },
    moved() {
      if (state.stopped || timer || (!state.active && ready)) return
      timer = setTimeout(send, Math.max(0, 150 - (Date.now() - last)))
    },
    /** Returns whether the revision changed since the last report. */
    updated(): boolean {
      const next = page.revision()
      if (!ready || next === revision) return false
      revision = next
      post({ type: 'updated', ...next ? { revision: next } : {} })
      return true
    },
    report(problem: PreviewProblem) {
      const message = { type: 'report' as const, ...problem }
      if (ready && state.active) post(message)
      else waiting.push(message)
    },
    resend() {
      sent = undefined
      last = 0
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
    },
  }
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = frameStyle()
  document.head.append(style)
}

/** Connects a page embedded by the workbench to the preview protocol; undefined when the page is not embedded. */
export function connectPreviewFrame(page: PreviewPage): PreviewFrame | undefined {
  if (typeof window === 'undefined' || window.parent === window || page.origins.length === 0) return undefined
  const nonce = previewNonce()
  if (!nonce) return undefined
  const state: FrameState = { active: isPreviewActive(), stopped: false }
  const playbackSupported = Boolean(page.pausePlayback && page.setPlaybackGate)
  const capabilities: PreviewCommandType[] = [...COMMANDS, ...page.confirmPresentation ? ['presentation-confirmed' as const] : [], ...page.nativeText ? ['edit-result' as const] : [], ...page.setActive ? ['activity' as const] : [], ...page.flush ? ['flush' as const] : [], ...page.documentHistory ? ['document-history' as const] : [], ...playbackSupported ? ['pause-playback' as const, 'playback-granted' as const] : [], ...page.productionPlayback && page.subscribeProductionPlayback ? ['production-playback' as const] : []]
  const nameWindow = (active: boolean) => {
    window.name = `${framePrefix()}${nonce}${active ? '' : PAUSED}`
  }
  nameWindow(state.active)
  const root = document.documentElement
  root.dataset.presmiumPreview = 'on'
  installStyle()

  const post = (message: PreviewReport) => {
    if (state.stopped || (!state.active && message.type !== 'ready' && message.type !== 'activity' && message.type !== 'playback-paused' && message.type !== 'production-playback-result')) return
    for (const origin of page.origins) window.parent.postMessage(previewEnvelope(nonce, message), origin)
  }
  editorReport = post
  // Stored drafts must wait until the parent's first ready handshake, and an
  // inactive retained frame must not begin another author write.
  page.activityChanged?.(false)

  // Requests are one-shot and cancelled on pause/unmount; a late grant cannot start a newer intent.
  let playbackRequest = Date.now()
  const pendingPlayback = new Map<number, (error?: Error) => void>()
  const cancelPlayback = () => {
    for (const finish of [...pendingPlayback.values()]) finish(new DOMException('Playback cancelled', 'AbortError'))
  }
  const authorizePlayback = (signal: AbortSignal): Promise<void> => {
    if (!isLive(state) || signal.aborted) return Promise.reject(new DOMException('Playback cancelled', 'AbortError'))
    const request = ++playbackRequest
    return new Promise<void>((resolve, reject) => {
      const abort = () => finish(new DOMException('Playback cancelled', 'AbortError'))
      const finish = (error?: Error) => {
        if (!pendingPlayback.delete(request)) return
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        error ? reject(error) : resolve()
      }
      const timeout = setTimeout(() => finish(new Error('playback-timeout')), 15_000)
      pendingPlayback.set(request, finish)
      signal.addEventListener('abort', abort, { once: true })
      post({ type: 'playback-request', request })
    })
  }
  // An older parent does not understand playback requests. Opt in only when a
  // parent first pauses formal playback before starting its own audition.
  let stopPlaybackGate: (() => void) | undefined
  const enablePlaybackGate = () => {
    if (playbackSupported && !stopPlaybackGate) stopPlaybackGate = page.setPlaybackGate!(authorizePlayback)
  }

  let productionRequest = -1
  let pendingProduction: { request: number, binding: ProductionBinding, controller: AbortController } | undefined
  const cancelProduction = () => {
    const pending = pendingProduction
    if (!pending) return
    pendingProduction = undefined; pending.controller.abort()
    post({ type: 'production-playback-result', request: pending.request, binding: pending.binding, error: 'production-playback-cancelled' })
  }
  let productionSent: ProductionPlaybackState | undefined, productionAt = 0
  const stopProduction = page.subscribeProductionPlayback?.(next => {
    if (!next || !isLive(state) || page.revision() !== next.binding.irRevision) return
    const previous = productionSent, before = previous?.position, position = next.position
    const urgent = !previous || !sameProductionBinding(previous.binding, next.binding) || previous.status !== next.status || previous.error !== next.error
      || !position?.playing || before?.playing !== position.playing || before?.sectionId !== position.sectionId || before?.stepId !== position.stepId || before?.rate !== position.rate || before?.trying !== position.trying
    const now = performance.now()
    if (!urgent && now - productionAt < 100) return
    productionSent = next; productionAt = now
    post({ type: 'production-playback-state', state: next })
  })
  const productionControl = (command: Extract<PreviewCommand, { type: 'production-playback' }>) => {
    if (command.request <= productionRequest) return post({ type: 'production-playback-result', request: command.request, binding: command.control.binding, error: 'production-request-stale' })
    productionRequest = command.request; cancelProduction()
    if (!isLive(state) || !page.productionPlayback) return post({ type: 'production-playback-result', request: command.request, binding: command.control.binding, error: 'production-playback-unavailable' })
    if (page.revision() !== command.control.binding.irRevision) return post({ type: 'production-playback-result', request: command.request, binding: command.control.binding, error: 'production-binding-stale' })
    enablePlaybackGate()
    const pending = { request: command.request, binding: command.control.binding, controller: new AbortController() }
    pendingProduction = pending
    void page.productionPlayback(command.control, pending.controller.signal).then(answer => {
      if (pendingProduction !== pending || pending.controller.signal.aborted) return
      pendingProduction = undefined
      if (!isLive(state) || page.revision() !== pending.binding.irRevision || !sameProductionBinding(answer.binding, pending.binding)) return post({ type: 'production-playback-result', request: pending.request, binding: pending.binding, error: 'production-binding-stale' })
      position.flush()
      post({ type: 'production-playback-result', request: pending.request, binding: pending.binding, state: answer })
    }, error => {
      if (pendingProduction !== pending || pending.controller.signal.aborted) return
      pendingProduction = undefined
      const code = error instanceof Error && /^[a-z][a-z0-9-]{0,99}$/.test(error.message) ? error.message : 'production-playback-failed'
      post({ type: 'production-playback-result', request: pending.request, binding: pending.binding, error: code })
    })
  }
  window.addEventListener('pagehide', cancelProduction)

  // Undo, redo and Escape belong to the workbench, except where the page's own fields take typing.
  const shortcut = (event: KeyboardEvent) => {
    if (!isLive(state)) return
    if (event.defaultPrevented || event.isComposing || event.altKey) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey) return post({ type: 'shortcut', command: 'dismiss' })
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    post({ type: 'shortcut', command: key === 'y' || event.shiftKey ? 'redo' : 'undo' })
  }
  window.addEventListener('keydown', shortcut)

  const locate = createLocator(page)
  const highlight = createHighlight(page, state, locate)
  const pins = createPins(locate)
  const flash = createFlash(page, state, locate)
  const rects = createRectReport(page, state, locate, post)
  const picking = createPicking(page, state, locate, rects, post)
  const editing = createEditing(page, state, locate, picking, post)
  window.addEventListener('pagehide', editing.preserve)
  const position = createPositionReport(page, state, post, capabilities)
  const selection = watchSelection(page, state, locate, rects, editing.isEditing, post)

  let frame = 0
  const redraw = () => {
    if (!isLive(state)) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!isLive(state)) return
      highlight.draw(false)
      pins.draw()
      editing.redraw()
      rects.moved()
    })
  }

  const observer = new MutationObserver(() => {
    if (highlight.isSet() || !pins.isEmpty()) redraw()
  })
  const observeBody = () => observer.observe(document.body, { childList: true, subtree: true })
  if (state.active) observeBody()

  let activity = Promise.resolve()
  const pause = () => {
    cancelProduction()
    cancelPlayback()
    editing.preserve()
    state.active = false
    page.activityChanged?.(false)
    nameWindow(false)
    position.cancel()
    selection.cancel()
    highlight.cancel()
    flash.cancel()
    cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    picking.clearHover()
    rects.cancel()
  }
  const changeActivity = (command: Extract<PreviewCommand, { type: 'activity' }>) => {
    if (!page.setActive) return
    activity = activity.then(async () => {
      if (state.stopped) return
      pause()
      try {
        await page.setActive!(command.active)
        if (state.stopped) return
        state.active = command.active
        nameWindow(state.active)
        const current = page.revision()
        post({ type: 'activity', active: state.active, request: command.request, ...current === undefined ? {} : { revision: current } })
        if (state.active) {
          page.activityChanged?.(true)
          observeBody()
          position.resend()
          position.moved()
          redraw()
        }
      } catch (error) {
        state.active = false
        nameWindow(false)
        post({ type: 'activity', active: false, request: command.request, error: errorMessage(error) })
      }
    }).catch((error) => {
      console.error(`[presmium] the preview activity could not be reported: ${errorMessage(error)}`)
    })
  }

  let flushing = Promise.resolve()
  const flush = (command: Extract<PreviewCommand, { type: 'flush' }>) => {
    flushing = flushing.then(async () => {
      if (!isLive(state) || !page.flush) throw new Error('preview-flush-unavailable')
      await editing.flush()
      if (!isLive(state)) throw new Error('preview-flush-unavailable')
      await page.flush()
      if (!isLive(state)) throw new Error('preview-flush-unavailable')
      position.flush()
      post({ type: 'flushed', request: command.request })
    }).catch(error => {
      post({ type: 'flushed', request: command.request, error: errorMessage(error) })
    })
  }

  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || !page.origins.includes(event.origin)) return
    const command = toPreviewCommand(event.data, nonce)
    if (!command) return
    try {
      switch (command.type) {
        case 'presentation-confirmed':
          if (isLive(state) && command.revision === page.revision()) page.confirmPresentation?.(command.revision)
          return
        case 'events-ready': case 'events-message': return page.events?.receive(command)
        case 'production-playback': return productionControl(command)
        case 'blocks-result': return void window.dispatchEvent(new CustomEvent('presmium:blocks-result', { detail: command }))
        case 'edit-result': return void window.dispatchEvent(new CustomEvent('presmium:edit-result', { detail: command }))
        case 'source-result': return void window.dispatchEvent(new CustomEvent('presmium:source-result', { detail: command }))
        case 'source-saved': return void window.dispatchEvent(new CustomEvent('presmium:source-saved', { detail: command }))
        case 'source-created': return void window.dispatchEvent(new CustomEvent('presmium:source-created', { detail: command }))
        case 'page-insert': return void window.dispatchEvent(new CustomEvent('presmium:page-insert', { detail: command }))
        case 'page-created': return void window.dispatchEvent(new CustomEvent('presmium:page-created', { detail: command }))
        case 'go': cancelProduction(); return page.go(command)
        case 'highlight': return highlight.show(command.target)
        case 'pick': return picking.set(command.on)
        case 'pins': return pins.set(command.targets)
        case 'marks': return void root.classList.toggle(AUTHOR_MARKS_CLASS, command.on)
        case 'appearance': return page.setDark(command.dark)
        case 'activity': return changeActivity(command)
        case 'pause-playback':
          if (!playbackSupported) return
          cancelProduction()
          enablePlaybackGate()
          cancelPlayback()
          return void Promise.resolve().then(() => page.pausePlayback!()).then(() => {
            position.flush()
            post({ type: 'playback-paused', request: command.request })
          }, error => post({ type: 'playback-paused', request: command.request, error: errorMessage(error) }))
        case 'playback-granted':
          if (isLive(state)) pendingPlayback.get(command.request)?.()
          return
        case 'flush': return flush(command)
        case 'document-history':
          try { post({ type: 'document-history-result', request: command.request, handled: Boolean(page.documentHistory?.(command.action)) }) }
          catch { post({ type: 'document-history-result', request: command.request, handled: false, error: 'document-history-failed' }) }
          return
        case 'document-history-reset': return page.resetDocumentHistory?.()
        case 'edit': return editing.edit(command)
        case 'flash': return flash.flash(command.targets)
      }
    } catch (error) {
      console.error(`[presmium] the preview could not take ${command.type}: ${errorMessage(error)}`)
    }
  }
  window.addEventListener('message', receive)

  position.moved()

  return {
    moved: position.moved,
    updated() {
      if (!isLive(state)) return
      if (position.updated()) {
        if (pendingProduction && pendingProduction.binding.irRevision !== page.revision()) cancelProduction()
        redraw()
      }
    },
    redraw,
    report(problem) {
      if (state.stopped) return
      position.report(problem)
    },
    stop() {
      page.events?.stop()
      cancelProduction(); stopProduction?.()
      cancelPlayback()
      stopPlaybackGate?.()
      editing.preserve()
      window.removeEventListener('pagehide', editing.preserve)
      window.removeEventListener('pagehide', cancelProduction)
      if (editorReport === post) editorReport = undefined
      state.stopped = true
      page.activityChanged?.(false)
      window.removeEventListener('message', receive)
      window.removeEventListener('keydown', shortcut)
      selection.stop()
      rects.stop()
      observer.disconnect()
      picking.set(false)
      position.cancel()
      highlight.cancel()
      flash.cancel()
      cancelAnimationFrame(frame)
      delete root.dataset.presmiumPreview
    },
  }
}
