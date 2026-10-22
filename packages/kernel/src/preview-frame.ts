import { AUTHOR_MARKS_CLASS, PREVIEW_NAME, PREVIEW_PARAM, previewEnvelope, toPreviewCommand } from './contracts/preview.ts'
import type { PreviewAnchor, PreviewCommand, PreviewCommandType, PreviewPin, PreviewPosition, PreviewReport } from './contracts/preview.ts'
import { errorMessage } from './errors.ts'

/** What a web or slides page gives the preview frame: its position, navigation and DOM. */
export interface PreviewPage {
  renderer: 'web' | 'slides'
  document: string
  origins: readonly string[]
  revision(): string | undefined
  position(): PreviewPosition | undefined
  go(command: Extract<PreviewCommand, { type: 'go' }>): void
  reveal(target: PreviewAnchor): void
  setDark(dark: boolean): void
  setActive?(active: boolean): void | Promise<void>
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

const FRAME_NAME = `${PREVIEW_NAME}:`
const PAUSED = ':paused'
const STYLE_ID = 'presmium-preview-style'
const HIGHLIGHT = 'data-preview-highlight'
const HOVER = 'data-preview-hover'
const POSITIONED = 'data-preview-positioned'
const PIN_CLASS = 'pm-preview-pin'
const CONTROLS = 'a, button, input, select, textarea, label, summary, [contenteditable], [role="dialog"]'
const COMMANDS: PreviewCommandType[] = ['go', 'highlight', 'pick', 'pins', 'marks', 'appearance']

const STYLE = `
[${HIGHLIGHT}] { outline: 2px solid var(--pm-color-accent, #1d6b7a) !important; outline-offset: 4px; border-radius: 2px; }
[${HOVER}] { outline: 2px dashed var(--pm-color-accent, #1d6b7a) !important; outline-offset: 2px; cursor: crosshair; }
[${POSITIONED}] { position: relative; }
.${PIN_CLASS} { position: absolute; top: -10px; left: -10px; z-index: 50; min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 10px; background: var(--pm-color-accent, #1d6b7a); color: #fff; font: 600 12px/20px system-ui, sans-serif; text-align: center; pointer-events: none; }
`

function previewNonce(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_PARAM)
  if (given) return given
  if (!window.name.startsWith(FRAME_NAME)) return undefined
  const own = window.name.slice(FRAME_NAME.length)
  return (own.endsWith(PAUSED) ? own.slice(0, -PAUSED.length) : own) || undefined
}

/** The Content-Security-Policy that lets only the workbench's origins embed a preview page. */
export function previewFrameAncestors(origins: readonly string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(' ') : "'none'"}`
}

export function isPreviewActive(): boolean {
  if (typeof window === 'undefined' || window.parent === window) return true
  const nonce = previewNonce()
  return !nonce || window.name !== `${FRAME_NAME}${nonce}${PAUSED}`
}

interface FrameState {
  active: boolean
  stopped: boolean
}

const isLive = (state: FrameState) => state.active && !state.stopped

/** Finds the sections and blocks the workbench names, among the elements a reader can see. */
function createLocator(page: PreviewPage) {
  const seen = (element: Element): boolean =>
    !element.closest('[inert], .pm-hidden') && element.getClientRects().length > 0 && (page.seen?.(element) ?? true)
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
  return {
    seenBlock,
    blockElement,
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
  return {
    draw,
    set(next: PreviewPin[]) {
      pins = next
      draw()
    },
    isEmpty: () => pins.length === 0,
  }
}

/** While picking, hovering outlines a block and a click reports it instead of acting on the page. */
function createPicking(page: PreviewPage, state: FrameState, locate: Locator, post: (message: PreviewReport) => void) {
  let picking = false
  let hovered: Element | undefined
  const clearHover = () => {
    hovered?.removeAttribute(HOVER)
    hovered = undefined
  }
  const hover = (event: MouseEvent) => {
    if (!isLive(state)) return
    const target = event.target instanceof Element ? event.target : undefined
    const block = target && !target.closest(CONTROLS) ? locate.seenBlock(target) : undefined
    if (block === hovered) return
    hovered?.removeAttribute(HOVER)
    hovered = block
    hovered?.setAttribute(HOVER, '')
  }
  const click = (event: MouseEvent) => {
    if (!isLive(state)) return
    const target = event.target instanceof Element ? event.target : undefined
    if (!target || event.button !== 0 || target.closest(CONTROLS)) return
    if (document.getSelection()?.isCollapsed === false) return
    const anchor = locate.anchorOf(target)
    if (!anchor) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const at = anchor.block ? page.stepOf?.({ section: anchor.section, block: anchor.block }) : undefined
    post({ type: 'picked', ...anchor, ...at ? { step: at.step, trail: at.trail } : {} })
  }
  return {
    clearHover,
    set(on: boolean) {
      if (on === picking) return
      picking = on
      if (on) {
        document.addEventListener('mouseover', hover, true)
        document.addEventListener('click', click, true)
        return
      }
      document.removeEventListener('mouseover', hover, true)
      document.removeEventListener('click', click, true)
      clearHover()
    },
  }
}

/** Reports the text the reader selects, with the block or section it lies in. */
function watchSelection(state: FrameState, locate: Locator, post: (message: PreviewReport) => void) {
  let selected = false
  let settling: ReturnType<typeof setTimeout> | undefined
  const changed = () => {
    clearTimeout(settling)
    if (!isLive(state)) return
    settling = setTimeout(() => {
      if (!isLive(state)) return
      const range = document.getSelection()
      const value = range && !range.isCollapsed ? range.toString().trim() : ''
      const node = range?.rangeCount ? range.getRangeAt(0).commonAncestorContainer : undefined
      const anchor = value && node ? locate.anchorOf(node instanceof Element ? node : node.parentElement ?? document.body) : undefined
      if (anchor) {
        selected = true
        post({ type: 'selection', selection: { ...anchor, text: value.slice(0, 4000) } })
      } else if (selected) {
        selected = false
        post({ type: 'selection', selection: null })
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
    const position = page.position()
    if (!position) return
    if (!ready) {
      ready = true
      revision = page.revision()
      post({ type: 'ready', renderer: page.renderer, document: page.document, ...revision ? { revision } : {}, capabilities })
    }
    if (!state.active) return
    for (const problem of waiting.splice(0)) post(problem)
    const key = JSON.stringify(position)
    if (key === sent) return
    sent = key
    last = Date.now()
    post({ type: 'position', ...position })
  }
  return {
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
  style.textContent = STYLE
  document.head.append(style)
}

/** Connects a page embedded by the workbench to the preview protocol; undefined when the page is not embedded. */
export function connectPreviewFrame(page: PreviewPage): PreviewFrame | undefined {
  if (typeof window === 'undefined' || window.parent === window || page.origins.length === 0) return undefined
  const nonce = previewNonce()
  if (!nonce) return undefined
  const state: FrameState = { active: isPreviewActive(), stopped: false }
  const capabilities: PreviewCommandType[] = [...COMMANDS, ...page.setActive ? ['activity' as const] : []]
  const nameWindow = (active: boolean) => {
    window.name = `${FRAME_NAME}${nonce}${active ? '' : PAUSED}`
  }
  nameWindow(state.active)
  const root = document.documentElement
  root.dataset.presmiumPreview = 'on'
  installStyle()

  const post = (message: PreviewReport) => {
    if (state.stopped || (!state.active && message.type !== 'ready' && message.type !== 'activity')) return
    for (const origin of page.origins) window.parent.postMessage(previewEnvelope(nonce, message), origin)
  }

  const shortcut = (event: KeyboardEvent) => {
    if (!isLive(state)) return
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return
    event.preventDefault()
    post({ type: 'shortcut', command: event.shiftKey ? 'open-commands' : 'open-files' })
  }
  window.addEventListener('keydown', shortcut)

  const locate = createLocator(page)
  const highlight = createHighlight(page, state, locate)
  const pins = createPins(locate)
  const picking = createPicking(page, state, locate, post)
  const position = createPositionReport(page, state, post, capabilities)
  const selection = watchSelection(state, locate, post)

  let frame = 0
  const redraw = () => {
    if (!isLive(state)) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!isLive(state)) return
      highlight.draw(false)
      pins.draw()
    })
  }

  const observer = new MutationObserver(() => {
    if (highlight.isSet() || !pins.isEmpty()) redraw()
  })
  const observeBody = () => observer.observe(document.body, { childList: true, subtree: true })
  if (state.active) observeBody()

  let activity = Promise.resolve()
  const pause = () => {
    state.active = false
    nameWindow(false)
    position.cancel()
    selection.cancel()
    highlight.cancel()
    cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    picking.clearHover()
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

  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || !page.origins.includes(event.origin)) return
    const command = toPreviewCommand(event.data, nonce)
    if (!command) return
    try {
      switch (command.type) {
        case 'go': return page.go(command)
        case 'highlight': return highlight.show(command.target)
        case 'pick': return picking.set(command.on)
        case 'pins': return pins.set(command.targets)
        case 'marks': return void root.classList.toggle(AUTHOR_MARKS_CLASS, command.on)
        case 'appearance': return page.setDark(command.dark)
        case 'activity': return changeActivity(command)
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
      if (position.updated()) redraw()
    },
    redraw,
    report(problem) {
      if (state.stopped) return
      position.report(problem)
    },
    stop() {
      state.stopped = true
      window.removeEventListener('message', receive)
      window.removeEventListener('keydown', shortcut)
      selection.stop()
      observer.disconnect()
      picking.set(false)
      position.cancel()
      highlight.cancel()
      cancelAnimationFrame(frame)
      delete root.dataset.presmiumPreview
    },
  }
}
