import { escape, LAYER } from '../../../kit/frame.ts'
export { escape }
export interface Shot { id: string; kind: string; title: string; labels: string[]; values?: number[]; mode?: string; figure?: string; source: string }
export const C = { blue: '#4e79a7', orange: '#f28e2b', pink: '#cc78a8', green: '#009e73', ink: 'var(--pm-color-ink)', muted: 'var(--pm-color-muted)', line: 'var(--pm-color-line-strong)', surface: 'var(--pm-color-surface)' }
export const svg = (body: string) => '<svg class="layer" ' + LAYER + '>' + '<g transform="translate(0 -8)">' + body + '</g></svg>'
export const tx = (t: string, x: number, y: number, size = 3.0, fill = C.ink, anchor = 'middle', cls = '') =>
  '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="' + size + '" font-weight="650" style="fill:' + fill + '">' + escape(t) + '</text>'
export const path = (x: number, y: number, x2: number, y2: number, color = C.line, cls = '') =>
  '<path class="' + cls + '" d="M' + x + ',' + y + ' C' + (x + x2) / 2 + ',' + y + ' ' + (x + x2) / 2 + ',' + y2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="' + color + '" stroke-width="0.55"/>'
export const rect = (x: number, y: number, w: number, h: number, color = C.surface, cls = '', stroke = C.line) =>
  '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.6" fill="' + color + '" stroke="' + stroke + '" stroke-width="0.35"/>'
export const trace = (x: number, y: number, color = C.orange, cls = '') =>
  '<g class="' + cls + '">' + rect(x,y,7,15,C.surface,'',color) + '<path d="M' + (x+1.4) + ',' + (y+3) + ' h4.2 m-4.2,3 h3.2 m-3.2,3 h4.2" stroke="' + color + '" stroke-width="0.6" fill="none"/>' + '</g>'
