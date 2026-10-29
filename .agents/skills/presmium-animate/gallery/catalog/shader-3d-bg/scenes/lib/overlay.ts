// The gallery's 16:9 frame (container units, type scale) laid over a Three.js canvas. `frame()` replaces the root's
// children, which would remove the canvas `threeScene` has already put there, so the frame goes in a layer of its
// own, appended after the canvas and transparent to the pointer. Captions, counters and source lines live here in
// HTML, where `var(--pm-color-*)` and the page fonts apply.
import { frame } from '../../../../lengths/scenes/kit/frame.ts'

export function overlay(root: HTMLElement, css: string, html: string): HTMLElement {
  const layer = document.createElement('div')
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(layer)
  return frame(layer, css, html)
}

