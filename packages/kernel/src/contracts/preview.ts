import { errorMessage } from '../errors.ts'

export const PREVIEW_PROTOCOL = 1

export const PREVIEW_NAME = 'presmium-preview'

export const PREVIEW_PARAM = 'presmium-preview'

export const PREVIEW_REVISION = 'presmiumRevision'

export const AUTHOR_MARKS_CLASS = 'pm-author-marks'

export function previewFrameAncestors(origins: readonly string[]): string {
  return `frame-ancestors ${origins.length > 0 ? origins.join(' ') : "'none'"}`
}

export interface PreviewAnchor {
  section: string
  block?: string
}

export interface PreviewPin {
  id: string
  section: string
  block: string
  label: string
}

export interface PreviewPosition {
  section: string
  step: number
  trail: string[]
  view?: string
}

export type PreviewCommand =
  | { type: 'go', section: string, step?: number, trail?: string[], view?: string }
  | { type: 'highlight', target: PreviewAnchor | null }
  | { type: 'pick', on: boolean }
  | { type: 'pins', targets: PreviewPin[] }
  | { type: 'marks', on: boolean }
  | { type: 'appearance', dark: boolean }

export type PreviewCommandType = PreviewCommand['type']

export type PreviewReport =
  | { type: 'ready', renderer: 'web' | 'slides', document: string, revision?: string, capabilities: PreviewCommandType[] }
  | ({ type: 'position' } & PreviewPosition)
  | { type: 'picked', section: string, block?: string, step?: number, trail?: string[] }
  | { type: 'selection', selection: (PreviewAnchor & { text: string }) | null }
  | { type: 'updated', revision?: string }
  | { type: 'report', level: 'error' | 'warning', plugin?: string, message: string }

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

export function isPreviewEnvelope(data: unknown, nonce: string): data is PreviewEnvelope<{ type: string }> {
  return record(data) && data.protocol === PREVIEW_NAME && data.nonce === nonce && typeof data.version === 'number' && text(data.type)
}

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

export interface PreviewPage {
  renderer: 'web' | 'slides'
  document: string
  origins: readonly string[]
  revision(): string | undefined
  position(): PreviewPosition | undefined
  go(command: Extract<PreviewCommand, { type: 'go' }>): void
  reveal(target: PreviewAnchor): void
  setDark(dark: boolean): void
  sectionOf?(element: Element): string | undefined
  sectionElement?(section: string): HTMLElement | undefined
  seen?(element: Element): boolean
  stepOf?(anchor: Required<PreviewAnchor>): { step: number, trail: string[] } | undefined
}

export interface PreviewAgent {
  moved(): void
  updated(): void
  redraw(): void
  report(problem: { level: 'error' | 'warning', plugin?: string, message: string }): void
  stop(): void
}

const FRAME_NAME = `${PREVIEW_NAME}:`
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
  return window.name.startsWith(FRAME_NAME) ? window.name.slice(FRAME_NAME.length) || undefined : undefined
}

export function startPreviewAgent(page: PreviewPage): PreviewAgent | undefined {
  if (typeof window === 'undefined' || window.parent === window || page.origins.length === 0) return undefined
  const nonce = previewNonce()
  if (!nonce) return undefined
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

  let highlight: PreviewAnchor | null = null
  let pins: PreviewPin[] = []
  let picking = false
  let ready = false
  const waiting: Extract<PreviewReport, { type: 'report' }>[] = []
  let sent: string | undefined
  let revision: string | undefined

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
  const elementOf = (target: PreviewAnchor) => (target.block ? blockElement(target.section, target.block) : sectionElement(target.section))
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
  let frame = 0
  const redraw = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      drawHighlight(false)
      drawPins()
    })
  }
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
