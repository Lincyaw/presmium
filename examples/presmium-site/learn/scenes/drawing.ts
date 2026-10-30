// What the lesson's two scenes draw alike: a 1280 × 720 SVG stage styled by design tokens, a chain of circles with
// its arms and pen, and the timing helpers that turn a place on the timeline into a state and a progress within it.
import type { Point } from './epicycles.ts'

const SVG = 'http://www.w3.org/2000/svg'
export const WIDTH = 1280, HEIGHT = 720

// Class names carry the lesson's prefix: a hand-written <style> is page-wide.
const STYLE = `
.fz-paper{fill:var(--pm-color-surface)}
.fz-target{fill:none;stroke:var(--pm-color-muted);stroke-width:2.5;stroke-dasharray:7 8;stroke-linejoin:round}
.fz-shade{fill:var(--pm-color-accent-soft);stroke:none}
.fz-circle{fill:none;stroke:var(--pm-color-muted);stroke-width:1.6}
.fz-arm{fill:none;stroke:var(--pm-color-ink);stroke-width:2;stroke-linejoin:round;opacity:.6}
.fz-hub{fill:var(--pm-color-ink)}
.fz-trace{fill:none;stroke:var(--pm-color-accent);stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
.fz-ghost{fill:none;stroke:var(--pm-color-accent);stroke-width:3;stroke-linejoin:round}
.fz-pen{fill:var(--pm-color-accent);stroke:var(--pm-color-surface);stroke-width:3}
.fz-count{fill:var(--pm-color-ink);font:600 96px var(--pm-font-sans)}
.fz-unit{fill:var(--pm-color-muted);font:400 34px var(--pm-font-sans)}
.fz-label{fill:var(--pm-color-muted);font:400 30px var(--pm-font-sans)}
.fz-value{fill:var(--pm-color-ink);font:500 34px var(--pm-font-mono)}
.fz-tick{fill:var(--pm-color-muted);font:400 23px var(--pm-font-mono)}
.fz-grid{stroke:var(--pm-color-line);stroke-width:1.5}
.fz-axis{stroke:var(--pm-color-line-strong);stroke-width:2}
.fz-series{fill:none;stroke:var(--pm-color-accent);stroke-width:3;stroke-linejoin:round}
.fz-dot{fill:var(--pm-color-accent);stroke:var(--pm-color-surface);stroke-width:3}
`

export type Attributes = Record<string, string | number>

export function element<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attributes: Attributes = {}): SVGElementTagNameMap[K] {
  const made = document.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attributes)) made.setAttribute(name, String(value))
  parent.append(made)
  return made
}

/** The stage: an SVG that keeps 1280 × 720 units whatever its size, on the page's surface. */
export function stage(root: HTMLElement, label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  svg.style.cssText = 'display:block;width:100%;height:100%'
  element(svg, 'style').textContent = STYLE
  element(svg, 'rect', { class: 'fz-paper', width: WIDTH, height: HEIGHT })
  root.replaceChildren(svg)
  return svg
}

/** A chain of up to `max` circles: each circle, the arms through the joints, the hub and the pen. */
export function chain(parent: Element, max: number) {
  const group = element(parent, 'g')
  const circles = Array.from({ length: max }, (_, i) => element(group, 'circle', { class: 'fz-circle', 'stroke-opacity': (0.85 - 0.6 * Math.sqrt(i / Math.max(1, max))).toFixed(2) }))
  const arms = element(group, 'path', { class: 'fz-arm' })
  const hub = element(group, 'circle', { class: 'fz-hub', r: 5 })
  const tip = element(group, 'circle', { class: 'fz-pen', r: 9 })
  return {
    /** Draws the circles about `joints` (already on the stage) with these radii; a radius under half a unit is hidden. */
    draw(joints: readonly Point[], radii: readonly number[], penShown = 1) {
      circles.forEach((circle, i) => {
        const r = radii[i] ?? 0
        circle.setAttribute('display', r > 0.5 ? 'inline' : 'none')
        if (r > 0.5) {
          circle.setAttribute('cx', joints[i]![0].toFixed(2))
          circle.setAttribute('cy', joints[i]![1].toFixed(2))
          circle.setAttribute('r', r.toFixed(2))
        }
      })
      arms.setAttribute('d', joints.length > 1 ? `M${joints.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}` : '')
      hub.setAttribute('cx', String(joints[0]![0]))
      hub.setAttribute('cy', String(joints[0]![1]))
      const end = joints.at(-1)!
      tip.setAttribute('cx', end[0].toFixed(2))
      tip.setAttribute('cy', end[1].toFixed(2))
      tip.setAttribute('opacity', String(penShown))
    },
  }
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
export const easeInOut = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u)
export const easeOut = (u: number) => 1 - (1 - u) ** 3
/** Overshoot by about 8% and settle: circles that pop out at the tip of the chain. */
export const pop = (u: number) => { const c = 1.7, v = u - 1; return u >= 1 ? 1 : 1 + (c + 1) * v ** 3 + c * v ** 2 }

/**
 * The timeline of a scene whose states each take one duration: the state shown at `ms` and the progress through it.
 * A step rests at the end of its state, so a boundary belongs to the earlier state.
 */
export function timeline(durations: readonly number[], at: (step: number) => number) {
  return {
    state(ms: number) {
      let state = 0
      while (state < durations.length - 1 && ms > at(state + 1)) state++
      return state
    },
    /** Progress from fraction `from` to fraction `to` of state `state`, clamped to 0..1. */
    phase(ms: number, state: number, from: number, to: number) {
      const length = durations[state] ?? 1
      return clamp01((ms - at(state) - from * length) / Math.max(1, (to - from) * length))
    },
  }
}

/** The page's language picks the figure's words, so one scene serves the Chinese lesson and its English translation. */
export function english(): boolean {
  return document.documentElement.lang.startsWith('en')
}
