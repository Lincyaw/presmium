/**
 * The preview protocol, version 1 (docs/design-dsh.md section 4): how a
 * workbench drives a product page (the web form, the slides) embedded in an
 * iframe, and how the page tells it where it is and what was picked. Only
 * ids of sections, blocks and steps and a little state go over it; the
 * workbench finds the source from the IR. The transport is
 * `window.postMessage`, each message in an envelope with the iframe's nonce.
 *
 * The agent of the protocol (`startPreviewAgent`) is the product's side,
 * framework-free, over the anchors the forms write (`[data-section]`,
 * `.pm-block[data-block]`); each form gives it its position and navigation.
 * It is only in the pages of the dev servers the workspace service starts
 * (`RenderContext.preview`): static builds and `presmium dev` have none.
 */
import { errorMessage } from '../errors.ts'

/** The protocol's version, in every envelope. */
export const PREVIEW_PROTOCOL = 1

/** The protocol's name, in every envelope. */
export const PREVIEW_NAME = 'presmium-preview'

/** The query parameter of a preview page's address that holds the nonce of its iframe. */
export const PREVIEW_PARAM = 'presmium-preview'

/**
 * The key of `IRDocument.meta` under which the workspace service gives its
 * dev servers the revision of the IR (`GET ir`), so a page can say which one
 * it shows (`ready`, `updated`).
 */
export const PREVIEW_REVISION = 'presmiumRevision'

/** The class of `<html>` that shows the author's marks (e.g. where a `{cue}` stands): `marks`, and edit mode until WP-96g. */
export const AUTHOR_MARKS_CLASS = 'pm-author-marks'

/** The `Content-Security-Policy` of a preview's pages: framed by these origins only, by none without any (docs/design-dsh.md 4.5). */
export function previewFrameAncestors(origins: readonly string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(' ') : "'none'"}`
}

/** A section, or a block of it. */
export interface PreviewAnchor {
  section: string
  block?: string
}

/** A numbered mark beside a block (`pins`). */
export interface PreviewPin {
  id: string
  section: string
  block: string
  label: string
}

/**
 * Where a page is. `step` is the page's own, as its form numbers the steps;
 * `trail` the keys of the steps reached (kernel `stepTrail`), from which a
 * reader of the whole document finds its step (`trailStep`), as the control
 * channel's position does. `view` is the web form's runtime view.
 */
export interface PreviewPosition {
  section: string
  step: number
  trail: string[]
  view?: string
}

/** The messages the workbench sends the page. */
export type PreviewCommand =
  /** Go to a section, at its step, in a view of the web form: with `trail`, the step the trail reaches (a workbench makes it from the whole document's step with `stepTrail`); with `step` alone, the page's own step, which in the slides differs from the whole document's when some blocks are for the web only. */
  | { type: 'go', section: string, step?: number, trail?: string[], view?: string }
  /** Frame a block or a section, brought into view; `null` clears. */
  | { type: 'highlight', target: PreviewAnchor | null }
  /** Pick mode: a click on a block says `picked` instead of acting; links, buttons and fields work. */
  | { type: 'pick', on: boolean }
  /** Numbered marks beside these blocks, where the page shows them; an empty list clears. */
  | { type: 'pins', targets: PreviewPin[] }
  /** Show the author's marks. */
  | { type: 'marks', on: boolean }
  /** Light or dark, as the workbench is. */
  | { type: 'appearance', dark: boolean }

export type PreviewCommandType = PreviewCommand['type']

/** The messages the page sends the workbench. */
export type PreviewReport =
  /** The agent runs: the form, the document, the revision of the IR shown, the commands it takes. */
  | { type: 'ready', renderer: 'web' | 'slides', document: string, revision?: string, capabilities: PreviewCommandType[] }
  /** The page moved; at most every 150 ms. */
  | ({ type: 'position' } & PreviewPosition)
  /**
   * A block (or a section's heading, a section's blank) picked; a block with the step it appears at, the page's
   * own, and the trail of that step, as `position` has them (a reader of the whole document finds its step with
   * `trailStep`: the slides leave out the steps of the blocks only other forms have).
   */
  | { type: 'picked', section: string, block?: string, step?: number, trail?: string[] }
  /** Text selected in the page, in a block or a section; `null` when nothing is. */
  | { type: 'selection', selection: (PreviewAnchor & { text: string }) | null }
  /** The page shows a new IR. */
  | { type: 'updated', revision?: string }
  /** A problem of the page at run time (a plugin that failed to start, a component's error), apart from the IR's diagnostics. */
  | { type: 'report', level: 'error' | 'warning', plugin?: string, message: string }

/** A message in its envelope. */
export type PreviewEnvelope<M> = M & { protocol: typeof PREVIEW_NAME, version: number, nonce: string }

export function previewEnvelope<M extends PreviewCommand | PreviewReport>(nonce: string, message: M): PreviewEnvelope<M> {
  return { protocol: PREVIEW_NAME, version: PREVIEW_PROTOCOL, nonce, ...message }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const optional = <T>(value: unknown, is: (v: unknown) => v is T) => value === undefined || is(value)
const step = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 10_000 && value.every(text)
const anchor = (value: unknown): value is PreviewAnchor => record(value) && text(value.section) && optional(value.block, text)

/** Whether `data` is an envelope of the protocol with this nonce, of any version. */
export function isPreviewEnvelope(data: unknown, nonce: string): data is PreviewEnvelope<{ type: string }> {
  return record(data) && data.protocol === PREVIEW_NAME && data.nonce === nonce && typeof data.version === 'number' && text(data.type)
}

/** A command as the page receives it: undefined for anything else (another protocol, version or nonce, an unknown type, a malformed field). */
export function readPreviewCommand(data: unknown, nonce: string): PreviewCommand | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'go': return text(m.section) && optional(m.step, step) && optional(m.trail, strings) && optional(m.view, text) ? { type: 'go', section: m.section, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {}, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'highlight': return m.target === null || anchor(m.target) ? { type: 'highlight', target: m.target === null ? null : { section: m.target.section, ...m.target.block ? { block: m.target.block } : {} } } : undefined
    case 'pick':
    case 'marks': return typeof m.on === 'boolean' ? { type: m.type, on: m.on } : undefined
    case 'appearance': return typeof m.dark === 'boolean' ? { type: 'appearance', dark: m.dark } : undefined
    case 'pins': return Array.isArray(m.targets) && m.targets.length <= 1000 && m.targets.every(t => record(t) && text(t.id) && text(t.section) && text(t.block) && text(t.label))
      ? { type: 'pins', targets: (m.targets as PreviewPin[]).map(({ id, section, block, label }) => ({ id, section, block, label })) }
      : undefined
    default: return undefined
  }
}

/** A report as the workbench receives it: undefined for anything else, as `readPreviewCommand`. */
export function readPreviewReport(data: unknown, nonce: string): PreviewReport | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'ready': return (m.renderer === 'web' || m.renderer === 'slides') && text(m.document) && optional(m.revision, text) && strings(m.capabilities) ? { type: 'ready', renderer: m.renderer, document: m.document, ...m.revision ? { revision: m.revision as string } : {}, capabilities: m.capabilities as PreviewCommandType[] } : undefined
    case 'position': return text(m.section) && step(m.step) && strings(m.trail) && optional(m.view, text) ? { type: 'position', section: m.section, step: m.step, trail: m.trail, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'picked': return text(m.section) && optional(m.block, text) && optional(m.step, step) && optional(m.trail, strings) ? { type: 'picked', section: m.section, ...m.block ? { block: m.block as string } : {}, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {} } : undefined
    case 'selection': return m.selection === null || (record(m.selection) && text(m.selection.text) && anchor(m.selection)) ? { type: 'selection', selection: m.selection as (PreviewAnchor & { text: string }) | null } : undefined
    case 'updated': return optional(m.revision, text) ? { type: 'updated', ...m.revision ? { revision: m.revision as string } : {} } : undefined
    case 'report': return (m.level === 'error' || m.level === 'warning') && text(m.message) && optional(m.plugin, text) ? { type: 'report', level: m.level, message: m.message, ...m.plugin ? { plugin: m.plugin as string } : {} } : undefined
    default: return undefined
  }
}

// The product's side --------------------------------------------------------------------------------------------

/** What a form gives the agent. */
export interface PreviewPage {
  renderer: 'web' | 'slides'
  /** The document's directory, relative to the workspace root. */
  document: string
  /** The parent origins the agent talks to (`RenderContext.preview.origins`). */
  origins: readonly string[]
  /** The revision of the IR the page shows (`PREVIEW_REVISION`). */
  revision(): string | undefined
  /** Where the page is; undefined until its form has started. */
  position(): PreviewPosition | undefined
  go(command: Extract<PreviewCommand, { type: 'go' }>): void
  /** Brings a section, at the step a block of it appears, into the page, so its elements are there (its chapter's page, its slide). */
  reveal(target: PreviewAnchor): void
  setDark(dark: boolean): void
  /** The section an element of the page is in, where its anchors do not say. */
  sectionOf?(element: Element): string | undefined
  /** The element of a whole section the reader sees; by default the first one with its `data-section`. */
  sectionElement?(section: string): HTMLElement | undefined
  /**
   * Whether the page shows an element at its step, besides the rule of every form (laid out, not under a modal
   * view or hidden by its step: `[inert]`, `.pm-hidden`): the slides hide what a click has not shown yet.
   */
  seen?(element: Element): boolean
  /** The step at which a block appears in the page, the page's own, and the trail of that step, for `picked`. */
  stepOf?(anchor: Required<PreviewAnchor>): { step: number, trail: string[] } | undefined
}

/** The running agent: the form tells it what changed. */
export interface PreviewAgent {
  /** The page moved: `position`, at most every 150 ms. */
  moved(): void
  /** The page shows a new IR (`updated`); the highlight and the pins are drawn again. */
  updated(): void
  /** The page's DOM changed (a page or a slide rendered): the highlight and the pins are drawn again. */
  redraw(): void
  report(problem: { level: 'error' | 'warning', plugin?: string, message: string }): void
  stop(): void
}

/** `window.name` of a frame whose agent ran, which keeps the nonce over navigations and reloads of the frame. */
const FRAME_NAME = `${PREVIEW_NAME}:`
const STYLE_ID = 'presmium-preview-style'
const HIGHLIGHT = 'data-preview-highlight'
const HOVER = 'data-preview-hover'
const POSITIONED = 'data-preview-positioned'
const PIN_CLASS = 'pm-preview-pin'
/** What a click in pick mode leaves to the page: controls and links (as edit mode's pick, WP-92d). */
const CONTROLS = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="dialog"]'
const COMMANDS: PreviewCommandType[] = ['go', 'highlight', 'pick', 'pins', 'marks', 'appearance']

const STYLE = `
[${HIGHLIGHT}] { outline: 2px solid var(--pm-color-accent, #1d6b7a) !important; outline-offset: 4px; border-radius: 2px; }
[${HOVER}] { outline: 2px dashed var(--pm-color-accent, #1d6b7a) !important; outline-offset: 2px; cursor: crosshair; }
[${POSITIONED}] { position: relative; }
.${PIN_CLASS} { position: absolute; top: -10px; left: -10px; z-index: 50; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px; background: var(--pm-color-accent, #1d6b7a); color: #fff; font: 600 12px/20px system-ui, sans-serif; text-align: center; pointer-events: none; }
`

/** The nonce of this frame: its address's parameter, else the one its agent kept when it ran here before. */
function previewNonce(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_PARAM)
  if (given) return given
  return window.name.startsWith(FRAME_NAME) ? window.name.slice(FRAME_NAME.length) || undefined : undefined
}

/**
 * Starts the agent in a page of a dev server that has one, when the three
 * conditions hold (docs/design-dsh.md 4.2): its address (or the frame, after
 * a navigation) has the nonce, it is in a frame, and it may talk to some
 * origins. It answers only messages of its parent window from those
 * origins with the nonce, posts only to them, and ignores the rest. It sends
 * `ready` once its form has a position. Browser only.
 */
export function startPreviewAgent(page: PreviewPage): PreviewAgent | undefined {
  if (typeof window === 'undefined' || window.parent === window || page.origins.length === 0) return undefined
  const nonce = previewNonce()
  if (!nonce) return undefined
  // Kept for this frame: a later page of the same frame (a reload at another address) starts again.
  window.name = `${FRAME_NAME}${nonce}`
  const root = document.documentElement
  root.dataset.presmiumPreview = 'on'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE
    document.head.append(style)
  }

  const post = (message: PreviewReport) => {
    for (const origin of page.origins) window.parent.postMessage(previewEnvelope(nonce, message), origin)
  }

  // What the workbench asked for, drawn again when the page changes.
  let highlight: PreviewAnchor | null = null
  let pins: PreviewPin[] = []
  let picking = false
  let ready = false
  /** Problems reported before `ready`, sent after it. */
  const waiting: Extract<PreviewReport, { type: 'report' }>[] = []
  let sent: string | undefined
  let revision: string | undefined

  /** Whether an element is laid out and not hidden by its step or under a modal view (the host's rule of what is seen), nor by its form. */
  const seen = (element: Element): boolean =>
    !element.closest('[inert], .pm-hidden') && element.getClientRects().length > 0 && (page.seen?.(element) ?? true)
  /** The block an element is in that the page shows: a block not shown yet (a later click of the slides) is none. */
  const seenBlock = (element: Element): HTMLElement | undefined => {
    for (let block = element.closest<HTMLElement>('.pm-block[data-block]'); block; block = block.parentElement?.closest<HTMLElement>('.pm-block[data-block]') ?? null) {
      if (seen(block)) return block
    }
    return undefined
  }
  const sectionOf = (element: Element): string | undefined =>
    element.closest<HTMLElement>('[data-section]')?.dataset.section ?? page.sectionOf?.(element)
  const blockElement = (section: string, block: string): HTMLElement | undefined => {
    for (const element of document.querySelectorAll<HTMLElement>(`.pm-block[data-block="${CSS.escape(block)}"]`)) {
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
  const elementOf = (target: PreviewAnchor) => (target.block ? blockElement(target.section, target.block) : sectionElement(target.section))
  /** The anchor of an element: its block that the page shows, else its section. */
  const anchorOf = (element: Element): PreviewAnchor | undefined => {
    const block = seenBlock(element)
    const section = sectionOf(block ?? element)
    if (!section) return undefined
    return block ? { section, block: block.dataset.block! } : { section }
  }

  const drawHighlight = (scroll: boolean) => {
    const element = highlight && elementOf(highlight)
    for (const other of document.querySelectorAll(`[${HIGHLIGHT}]`)) if (other !== element) other.removeAttribute(HIGHLIGHT)
    if (!element) return false
    element.setAttribute(HIGHLIGHT, '')
    if (scroll) {
      const box = element.getBoundingClientRect()
      if (box.bottom < 0 || box.top > window.innerHeight) element.scrollIntoView({ block: 'center' })
    }
    return true
  }
  const drawPins = () => {
    const wanted = new Map<HTMLElement, PreviewPin[]>()
    for (const pin of pins) {
      const element = blockElement(pin.section, pin.block)
      if (element) wanted.set(element, [...wanted.get(element) ?? [], pin])
    }
    for (const old of document.querySelectorAll<HTMLElement>(`.${PIN_CLASS}`)) {
      const host = old.parentElement
      if (!host || !wanted.get(host)?.some(pin => pin.id === old.dataset.pin && pin.label === old.textContent)) old.remove()
    }
    for (const host of document.querySelectorAll<HTMLElement>(`[${POSITIONED}]`)) {
      if (!wanted.has(host)) host.removeAttribute(POSITIONED)
    }
    for (const [element, own] of wanted) {
      if (getComputedStyle(element).position === 'static') element.setAttribute(POSITIONED, '')
      own.forEach((pin, i) => {
        if ([...element.children].some(child => child.classList.contains(PIN_CLASS) && (child as HTMLElement).dataset.pin === pin.id)) return
        const mark = document.createElement('span')
        mark.className = PIN_CLASS
        mark.dataset.pin = pin.id
        mark.textContent = pin.label
        mark.setAttribute('aria-hidden', 'true')
        if (i > 0) mark.style.left = `${-10 + 24 * i}px`
        element.append(mark)
      })
    }
  }
  /** Draws again what the page lost (its DOM was rendered again), on the next frame. */
  let frame = 0
  const redraw = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      drawHighlight(false)
      drawPins()
    })
  }
  /** Highlights a target not in the page yet: its section comes in, then it is drawn once it renders. */
  const showHighlight = (target: PreviewAnchor | null) => {
    highlight = target
    if (!target) return void drawHighlight(false)
    if (drawHighlight(true)) return
    page.reveal(target)
    const until = Date.now() + 5000
    const retry = () => {
      if (highlight !== target || drawHighlight(true) || Date.now() > until) return
      setTimeout(retry, 100)
    }
    setTimeout(retry, 50)
  }

  // Pick mode: the block under the pointer framed; a click on it reported, not acted on.
  let hovered: Element | undefined
  const hover = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : undefined
    const block = target && !target.closest(CONTROLS) ? seenBlock(target) : undefined
    if (block === hovered) return
    hovered?.removeAttribute(HOVER)
    hovered = block
    hovered?.setAttribute(HOVER, '')
  }
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : undefined
    if (!target || event.button !== 0 || target.closest(CONTROLS)) return
    // A selection is the reader's, sent as `selection`.
    if (document.getSelection()?.isCollapsed === false) return
    const anchor = anchorOf(target)
    if (!anchor) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const at = anchor.block ? page.stepOf?.({ section: anchor.section, block: anchor.block }) : undefined
    post({ type: 'picked', ...anchor, ...at ? { step: at.step, trail: at.trail } : {} })
  }
  const setPicking = (on: boolean) => {
    if (on === picking) return
    picking = on
    if (on) {
      document.addEventListener('mouseover', hover, true)
      document.addEventListener('click', click, true)
      return
    }
    document.removeEventListener('mouseover', hover, true)
    document.removeEventListener('click', click, true)
    hovered?.removeAttribute(HOVER)
    hovered = undefined
  }

  // Text selected in the page: its block or section and the text, or none.
  let selected = false
  let selecting: ReturnType<typeof setTimeout> | undefined
  const selection = () => {
    clearTimeout(selecting)
    selecting = setTimeout(() => {
      const range = document.getSelection()
      const value = range && !range.isCollapsed ? range.toString().trim() : ''
      const node = range?.rangeCount ? range.getRangeAt(0).commonAncestorContainer : undefined
      const anchor = value && node ? anchorOf(node instanceof Element ? node : node.parentElement ?? document.body) : undefined
      if (anchor) {
        selected = true
        post({ type: 'selection', selection: { ...anchor, text: value.slice(0, 4000) } })
      } else if (selected) {
        selected = false
        post({ type: 'selection', selection: null })
      }
    }, 200)
  }
  document.addEventListener('selectionchange', selection)

  // The page renders anew (a chapter's page, a slide, a live update): the highlight and the pins are drawn again.
  const observer = new MutationObserver(() => {
    if (highlight || pins.length > 0) redraw()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || !page.origins.includes(event.origin)) return
    const command = readPreviewCommand(event.data, nonce)
    if (!command) return
    try {
      switch (command.type) {
        case 'go': return page.go(command)
        case 'highlight': return showHighlight(command.target)
        case 'pick': return setPicking(command.on)
        case 'pins':
          pins = command.targets
          return drawPins()
        case 'marks': return void root.classList.toggle(AUTHOR_MARKS_CLASS, command.on)
        case 'appearance': return page.setDark(command.dark)
      }
    } catch (error) {
      console.error(`[presmium] the preview could not take ${command.type}: ${errorMessage(error)}`)
    }
  }
  window.addEventListener('message', receive)

  // The position, at most every 150 ms; the first once the form has one, after `ready`.
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = 0
  const sendPosition = () => {
    timer = undefined
    const position = page.position()
    if (!position) return
    if (!ready) {
      ready = true
      revision = page.revision()
      post({ type: 'ready', renderer: page.renderer, document: page.document, ...revision ? { revision } : {}, capabilities: COMMANDS })
      for (const problem of waiting.splice(0)) post(problem)
    }
    const key = JSON.stringify(position)
    if (key === sent) return
    sent = key
    last = Date.now()
    post({ type: 'position', ...position })
  }
  const moved = () => {
    if (timer) return
    timer = setTimeout(sendPosition, Math.max(0, 150 - (Date.now() - last)))
  }
  moved()

  return {
    moved,
    updated() {
      const next = page.revision()
      if (!ready || next === revision) return
      revision = next
      post({ type: 'updated', ...next ? { revision: next } : {} })
      redraw()
    },
    redraw,
    report(problem) {
      const message = { type: 'report' as const, ...problem }
      if (ready) post(message)
      else waiting.push(message)
    },
    stop() {
      window.removeEventListener('message', receive)
      document.removeEventListener('selectionchange', selection)
      observer.disconnect()
      setPicking(false)
      clearTimeout(timer)
      clearTimeout(selecting)
      delete root.dataset.presmiumPreview
    },
  }
}
