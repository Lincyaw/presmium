import { blockElement, codeLinesBox } from '@lincyaw/host'
import type { Navigation } from '@lincyaw/host'
import { watch } from 'vue'
import type { CueRequest, ShowCue } from './cue.ts'
import { requestHint } from './hints.ts'
import { requestSpotlight } from './spotlight.ts'

export interface OperationCue {
  block?: string
  selector?: string
  lines?: string
  span?: number
  title?: string
  text?: string
}

const REFRESH_MS = 250

function firstVisible(elements: Iterable<HTMLElement>): HTMLElement | undefined {
  for (const el of elements) {
    if (!el.closest('[inert], .pm-hidden') && el.getClientRects().length > 0) return el
  }
  return undefined
}

function sameTarget(a: OperationCue, b: OperationCue): boolean {
  return a.block === b.block && a.selector === b.selector && a.lines === b.lines
}

export function toOperationCue(data: Record<string, unknown>): OperationCue | undefined {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  const cue: OperationCue = {
    block: text(data.block),
    selector: text(data.selector),
    lines: typeof data.lines === 'number' ? String(data.lines) : text(data.lines),
    span: typeof data.span === 'number' && data.span > 0 ? data.span : undefined,
    title: text(data.title),
    text: text(data.text),
  }
  return cue.block || cue.selector ? cue : undefined
}

export class OperationCues {
  private current?: { cue: OperationCue, slide: number, step: number }
  private readonly owner = {}
  private box?: HTMLElement
  private timer?: ReturnType<typeof setInterval>
  private navigation?: Navigation
  private unwatch?: () => void
  private readonly show: ShowCue

  constructor(show: ShowCue) {
    this.show = show
  }

  bind(navigation: Navigation | undefined): void {
    this.unwatch?.()
    this.navigation = navigation
    this.unwatch = navigation && watch(navigation.position, ({ slide, step }) => {
      const now = this.current
      if (now && (slide !== now.slide || step < now.step || step > now.step + (now.cue.span ?? 0))) this.hide()
    }, { flush: 'sync' })
  }

  unbind(): void {
    this.hide()
    this.unwatch?.()
    this.unwatch = undefined
    this.navigation = undefined
  }

  get shown(): OperationCue | undefined {
    return this.current?.cue
  }

  apply(data: Record<string, unknown>, animate = true): void {
    const cue = toOperationCue(data)
    if (!cue) return this.hide()
    const position = this.navigation?.position.value ?? { slide: 0, step: 0 }
    this.current = { cue, slide: position.slide, step: position.step }
    this.draw(animate)
    clearInterval(this.timer)
    this.timer = setInterval(() => this.draw(animate), REFRESH_MS)
  }

  isShowing(data: Record<string, unknown>): boolean {
    const cue = toOperationCue(data)
    return Boolean(cue && this.current && sameTarget(cue, this.current.cue))
  }

  hide(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.current = undefined
    this.box?.remove()
    this.box = undefined
    this.show(this.owner, undefined)
  }

  private draw(animate: boolean): void {
    const cue = this.current?.cue
    if (!cue) return
    let element: HTMLElement | undefined
    try {
      element = cue.block ? blockElement(cue.block) : firstVisible(document.querySelectorAll<HTMLElement>(cue.selector!))
    } catch {
      element = undefined
    }
    const lines = element && cue.lines ? codeLinesBox(element, cue.lines) : undefined
    if (lines) {
      this.box ??= Object.assign(document.createElement('div'), { className: 'pm-cue-lines' })
      Object.assign(this.box.style, { position: 'fixed', pointerEvents: 'none', left: `${lines.left}px`, top: `${lines.top}px`, width: `${lines.width}px`, height: `${lines.height}px` })
      if (!this.box.isConnected) document.body.append(this.box)
      element = this.box
    }
    const request: CueRequest | undefined = element && { element, title: cue.title, text: cue.text, animate }
    this.show(this.owner, request)
  }
}

export const spotlightCues = new OperationCues(requestSpotlight)
export const hintCues = new OperationCues(requestHint)
