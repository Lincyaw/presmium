// WCAG AA in the page: the one check of the specs of the shell (e2e/design.spec.ts), the plugins' UIs and the
// slides theme (e2e/plugin-ui.spec.ts) and the remote environment's token dialog (e2e/exec-remote.spec.ts).
import type { Page } from '@playwright/test'

/**
 * What under `scope` falls short of WCAG AA. Texts whose contrast with what is behind them is below 4.5:1, or 3:1 for
 * large text (24 px, or 18.66 px bold; on a slide, its size scaled to the screen) (1.4.3); the background is every
 * ancestor's background colour composited, the text's colour with the opacity of its ancestors. And the borders that
 * show what a control is or which one is chosen, those of the host's fields, of the web form's view menu and of a
 * chosen segment, below 3:1 against the control's background or what is around it (1.4.11). Disabled controls are left out,
 * as WCAG does, and so is text a slide hides until its step, and what is inside `except` (another part's own
 * colours, e.g. the web form's highlighting of code). Open shadow roots are looked into (the slides draw a Mermaid
 * diagram in one); SVG text is measured with its fill.
 */
export function lowContrast(page: Page, scope = 'body', except?: string): Promise<string[]> {
  return page.evaluate(([selector, skip]) => {
    const parse = (value: string): number[] => {
      const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(value)
      if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])]
      const parts = (/rgba?\(([^)]+)\)/.exec(value)?.[1] ?? '0 0 0 0').split(/[\s,/]+/).filter(Boolean).map(Number)
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
    }
    const over = (top: number[], below: number[]) => [0, 1, 2].map(i => top[i]! * top[3]! + below[i]! * (1 - top[3]!)).concat(1)
    const luminance = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const ratio = (a: number[], b: number[]) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (high! + 0.05) / (low! + 0.05)
    }
    /** An element's parent, across the edge of a shadow root to its host. */
    const parentOf = (element: Element): Element | null => element.parentElement ?? ((element.getRootNode() as ShadowRoot).host ?? null)
    /** An element's background over its ancestors', and the opacity it is drawn with. */
    const backdrop = (element: Element) => {
      let background = [255, 255, 255, 1]
      let opacity = 1
      const layers: number[][] = []
      for (let at: Element | null = element; at; at = parentOf(at)) {
        const own = getComputedStyle(at)
        opacity *= Number(own.opacity)
        layers.push(parse(own.backgroundColor))
      }
      for (const layer of layers.reverse()) background = over(layer, background)
      return { background, opacity }
    }
    /** Whether an element or an ancestor, across shadow roots, matches. */
    const within = (element: Element, selectors: string) => {
      for (let at: Element | null = element; at; at = parentOf(at)) if (at.matches(selectors)) return true
      return false
    }
    const shown = (element: Element) => {
      if (within(element, '[aria-hidden="true"], :disabled, [aria-disabled="true"]')) return false
      if (skip && within(element, skip)) return false
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
      const box = element.getBoundingClientRect()
      return box.width > 1 && box.height > 1
    }
    /** The elements under `selector`, and those in the open shadow roots among them. */
    const elements = (query: string): HTMLElement[] => {
      const found: HTMLElement[] = []
      const add = (element: HTMLElement) => {
        found.push(element)
        if (element.shadowRoot) element.shadowRoot.querySelectorAll<HTMLElement>('*').forEach(add)
      }
      document.querySelectorAll<HTMLElement>(query).forEach(add)
      return found
    }
    const failures: string[] = []
    for (const element of elements(`${selector}, ${selector} *`)) {
      const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? '').join('').trim()
      if (!text || !shown(element)) continue
      const style = getComputedStyle(element)
      const { background, opacity } = backdrop(element)
      // SVG text is drawn with its fill (the labels of a diagram drawn without HTML).
      const color = parse(element instanceof SVGElement && /^(rgb|color)/.test(style.fill) ? style.fill : style.color)
      const drawn = over([color[0]!, color[1]!, color[2]!, color[3]! * opacity], background)
      // On a slide the px are the slide's, scaled to the screen.
      const scale = element.getBoundingClientRect().height / (element.offsetHeight || element.getBoundingClientRect().height) || 1
      const size = Number.parseFloat(style.fontSize) * scale
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      const value = ratio(drawn, background)
      if (value < (large ? 3 : 4.5)) failures.push(`${text.slice(0, 40)} (${element.getAttribute('class') || element.tagName}: ${value.toFixed(2)})`)
    }
    const bounded = '.pm-ui-input, .pm-ui-select, .pm-ui-textarea, .pm-ui-search, .pm-view-menu, .pm-ui-segmented__option[aria-pressed="true"]'
    for (const element of document.querySelectorAll<HTMLElement>(`${selector} :is(${bounded})`)) {
      if (!shown(element) || !element.parentElement) continue
      const inside = backdrop(element)
      const around = backdrop(element.parentElement).background
      const border = parse(getComputedStyle(element).borderTopColor)
      const drawn = over([border[0]!, border[1]!, border[2]!, border[3]! * inside.opacity], inside.background)
      const value = Math.min(ratio(drawn, inside.background), ratio(drawn, around))
      if (value < 3) failures.push(`border of ${element.id || element.getAttribute('name') || element.className}: ${value.toFixed(2)}`)
    }
    return failures
  }, [scope, except] as const)
}
