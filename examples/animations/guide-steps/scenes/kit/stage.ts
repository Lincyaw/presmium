// Shared by the D3 scenes: an SVG stage with a fixed 640×360 coordinate system that scales with the scene,
// and the phase helper that turns the time into a 0..1 progress inside one step.
import type * as D3Module from 'd3'

export const W = 640
export const H = 360

export const clamp = (t: number) => Math.max(0, Math.min(1, t))

/** An SVG that fills `root`, drawn in a 640×360 box; text uses the deck's sans font and ink colour. */
export function stage(d3: typeof D3Module, root: HTMLElement) {
  return d3.select(root).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('width', '100%').attr('height', '100%')
    .style('display', 'block')
    .style('font-family', 'var(--pm-font-sans)')
    .style('color', 'var(--pm-color-ink)')
    .attr('fill', 'currentColor')
}

/**
 * Progress inside step `k` at `ms`: 0 before it starts, 1 after it ends. `from`/`to` (0..1) take a slice of the
 * step, so parts of one step can follow each other.
 */
export function phase(at: (k: number) => number, ms: number) {
  return (k: number, from = 0, to = 1) => {
    const t = (ms - at(k)) / (at(k + 1) - at(k))
    return clamp((t - from) / (to - from))
  }
}

/** Gives a D3 axis group the deck's look: muted lines, mono tick labels. */
export function axisStyle(g: D3Module.Selection<SVGGElement, unknown, null, undefined>) {
  g.attr('font-family', 'var(--pm-font-mono)').attr('font-size', 11).style('color', 'var(--pm-color-muted)')
}
