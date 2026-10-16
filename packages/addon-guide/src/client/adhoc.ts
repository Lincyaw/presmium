/**
 * Spotlights and hints the presenter puts on a block while presenting, as
 * the operations `spot` and `hint` (docs/ir.md 9.2): reported when the
 * presenter makes one (`s` and `h` over a block, see viewer.ts) and replayed
 * by a lecture player. The data names the block (`<section>/<block>`) or a
 * CSS selector, optionally code `lines` (`3-5`), a `title` and `text`; data
 * without a target turns the cue off. A cue lasts while the position stays
 * in its section and step (`span` more steps), so the picture at any time is
 * a function of the operations before it, whether they were made, replayed
 * in order or replayed at once (a seek).
 */
import type { Navigation } from '@presmium/host'
import { watch } from 'vue'
import type { CueRequest, ShowCue } from './cue.ts'
import { requestHint } from './hints.ts'
import { requestSpotlight } from './spotlight.ts'

export interface AdhocCue {
  /** `<section id>/<block id>`. */
  block?: string
  selector?: string
  /** Code lines of the block, e.g. `3-5` or `2,4`. */
  lines?: string
  /** Further steps the cue lasts. */
  span?: number
  title?: string
  text?: string
}

/** How often a cue looks for its target again, which a page layout or a move may have changed. */
const REFRESH_MS = 250

/** Visible elements of the page that are not under a modal view (the present view makes the page under it inert). */
function visible(elements: Iterable<HTMLElement>): HTMLElement | undefined {
  for (const el of elements) {
    if (!el.closest('[inert]') && el.getClientRects().length > 0) return el
  }
  return undefined
}

/** The element of block `<section>/<block>` the audience sees: the present view's, else a page view's. */
export function blockElement(key: string): HTMLElement | undefined {
  const cut = key.lastIndexOf('/')
  if (cut <= 0) return undefined
  const [section, block] = [key.slice(0, cut), key.slice(cut + 1)]
  return visible(document.querySelectorAll<HTMLElement>(`[data-section="${CSS.escape(section)}"] .pm-block[data-block="${CSS.escape(block)}"]`))
}

/** The block under a point of the page, as its key; undefined outside blocks. */
export function blockAt(x: number, y: number): string | undefined {
  const block = document.elementFromPoint(x, y)?.closest<HTMLElement>('.pm-block[data-block]')
  const section = block?.closest<HTMLElement>('[data-section]')?.dataset.section
  return block && section ? `${section}/${block.dataset.block}` : undefined
}

/** The numbers a `lines` value names. */
function lineNumbers(lines: string): number[] {
  return lines.split(/[\s,]+/).flatMap((part) => {
    const [from, to = from] = part.split('-').map(Number)
    return Number.isInteger(from) && Number.isInteger(to) && from! > 0 ? Array.from({ length: Math.max(0, to! - from! + 1) }, (_, k) => from! + k) : []
  })
}

/** The box of code lines in a block: from the first line named to the last, as wide as the listing. */
function linesBox(block: HTMLElement, lines: string): DOMRect | undefined {
  const rows = [...block.querySelectorAll<HTMLElement>('.pm-code .line')]
  const named = lineNumbers(lines).map(n => rows[n - 1]).filter((row): row is HTMLElement => Boolean(row))
  if (named.length === 0) return undefined
  const code = block.querySelector('.pm-code')!.getBoundingClientRect()
  const top = Math.min(...named.map(row => row.getBoundingClientRect().top))
  const bottom = Math.max(...named.map(row => row.getBoundingClientRect().bottom))
  return new DOMRect(code.left, top, code.width, bottom - top)
}

function sameCue(a: AdhocCue, b: AdhocCue): boolean {
  return a.block === b.block && a.selector === b.selector && a.lines === b.lines
}

export function cueOf(data: Record<string, unknown>): AdhocCue | undefined {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  const cue: AdhocCue = {
    block: text(data.block),
    selector: text(data.selector),
    lines: typeof data.lines === 'number' ? String(data.lines) : text(data.lines),
    span: typeof data.span === 'number' && data.span > 0 ? data.span : undefined,
    title: text(data.title),
    text: text(data.text),
  }
  return cue.block || cue.selector ? cue : undefined
}

/** The cues of one kind (`spot` or `hint`) made outside the steps: at most one at a time. */
export class AdhocCues {
  private current?: { cue: AdhocCue, slide: number, step: number }
  private readonly owner = {}
  /** A box laid over code lines, which the effect then draws on. */
  private box?: HTMLElement
  private timer?: ReturnType<typeof setInterval>
  private navigation?: Navigation
  private unwatch?: () => void
  private readonly show: ShowCue

  constructor(show: ShowCue) {
    this.show = show
  }

  /** Follows the position of a started host: a cue ends when the position leaves its section and steps. */
  bind(navigation: Navigation | undefined): void {
    this.unwatch?.()
    this.navigation = navigation
    this.unwatch = navigation && watch(navigation.position, ({ slide, step }) => {
      const now = this.current
      if (now && (slide !== now.slide || step < now.step || step > now.step + (now.cue.span ?? 0))) this.off()
    }, { flush: 'sync' })
  }

  unbind(): void {
    this.off()
    this.unwatch?.()
    this.unwatch = undefined
    this.navigation = undefined
  }

  /** The cue shown now, if any. */
  get shown(): AdhocCue | undefined {
    return this.current?.cue
  }

  /** Shows the cue of an operation's data, or none; `animate` false while a player seeks. */
  apply(data: Record<string, unknown>, animate = true): void {
    const cue = cueOf(data)
    if (!cue) return this.off()
    const position = this.navigation?.position.value ?? { slide: 0, step: 0 }
    this.current = { cue, slide: position.slide, step: position.step }
    this.draw(animate)
    clearInterval(this.timer)
    this.timer = setInterval(() => this.draw(animate), REFRESH_MS)
  }

  /** Whether `data` names the cue shown now. */
  showing(data: Record<string, unknown>): boolean {
    const cue = cueOf(data)
    return Boolean(cue && this.current && sameCue(cue, this.current.cue))
  }

  off(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.current = undefined
    this.box?.remove()
    this.box = undefined
    this.show(this.owner, undefined)
  }

  /** Draws the cue on its target as it is laid out now; nothing while the target is not shown. */
  private draw(animate: boolean): void {
    const cue = this.current?.cue
    if (!cue) return
    let element: HTMLElement | undefined
    try {
      element = cue.block ? blockElement(cue.block) : visible(document.querySelectorAll<HTMLElement>(cue.selector!))
    } catch {
      element = undefined
    }
    const lines = element && cue.lines ? linesBox(element, cue.lines) : undefined
    if (lines) {
      this.box ??= Object.assign(document.createElement('div'), { className: 'pm-adhoc-lines' })
      Object.assign(this.box.style, { position: 'fixed', pointerEvents: 'none', left: `${lines.left}px`, top: `${lines.top}px`, width: `${lines.width}px`, height: `${lines.height}px` })
      if (!this.box.isConnected) document.body.append(this.box)
      element = this.box
    }
    const request: CueRequest | undefined = element && { element, title: cue.title, text: cue.text, animate }
    this.show(this.owner, request)
  }
}

export const spots = new AdhocCues(requestSpotlight)
export const hints = new AdhocCues(requestHint)
