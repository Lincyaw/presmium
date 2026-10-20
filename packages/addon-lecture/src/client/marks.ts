import type { PathPoint } from '../domain/index.ts'
import { blockElement, codeLines, lineNumbers } from '@lincyaw/host'

const LASER_MS = 1500

interface Pointer {
  block: string
  path: PathPoint[]
  from: number
  animate: boolean
}

interface Ink {
  block: string
  tool: 'laser' | 'marker'
  lines?: string
  range?: [number, number, number, number]
  until?: number
}

let pointer: Pointer | undefined
let inks: Ink[] = []
let layer: HTMLElement | undefined
let frame = 0

function path(value: unknown): PathPoint[] {
  return Array.isArray(value)
    ? value.filter((p): p is PathPoint => Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number'))
    : []
}

function range(value: unknown): Ink['range'] {
  return Array.isArray(value) && value.length === 4 && value.every(n => typeof n === 'number') ? value as Ink['range'] : undefined
}

function along(points: PathPoint[], elapsed: number): PathPoint {
  const next = points.findIndex(([t]) => t > elapsed)
  if (next <= 0) return next === 0 ? points[0]! : points.at(-1)!
  const [t0, x0, y0] = points[next - 1]!
  const [t1, x1, y1] = points[next]!
  const k = (elapsed - t0) / Math.max(1, t1 - t0)
  return [elapsed, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]
}

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer
  layer = document.createElement('div')
  layer.className = 'pm-lecture-marks'
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 'calc(var(--pm-cue-z, 1) + 2)' })
  document.body.append(layer)
  return layer
}

function inkBox(ink: Ink, block: HTMLElement): DOMRect | undefined {
  if (ink.lines) {
    const rows = codeLines(block)
    const named = lineNumbers(ink.lines).map(n => rows[n - 1]).filter((row): row is HTMLElement => Boolean(row))
    if (named.length === 0) return undefined
    const code = block.querySelector('.pm-code')?.getBoundingClientRect() ?? block.getBoundingClientRect()
    const top = Math.min(...named.map(row => row.getBoundingClientRect().top))
    const bottom = Math.max(...named.map(row => row.getBoundingClientRect().bottom))
    return new DOMRect(code.left, top, code.width, bottom - top)
  }
  if (!ink.range) return undefined
  const box = block.getBoundingClientRect()
  const [x0, y0, x1, y1] = ink.range
  return new DOMRect(box.left + Math.min(x0, x1) * box.width, box.top + Math.min(y0, y1) * box.height, Math.abs(x1 - x0) * box.width, Math.abs(y1 - y0) * box.height)
}

const STYLES: Record<string, Partial<CSSStyleDeclaration>> = {
  marker: { background: 'rgb(250 204 21 / 0.35)', borderRadius: '3px', mixBlendMode: 'multiply' },
  laser: { boxShadow: '0 0 0 3px rgb(239 68 68 / 0.85), 0 0 18px rgb(239 68 68 / 0.6)', borderRadius: '6px' },
  pointer: { width: '16px', height: '16px', borderRadius: '50%', background: 'rgb(239 68 68 / 0.9)', boxShadow: '0 0 0 4px rgb(239 68 68 / 0.25)' },
}

function slot(root: HTMLElement, k: number, kind: string, block: string): HTMLElement {
  let el = root.children[k] as HTMLElement | undefined
  if (!el || el.dataset.kind !== kind) {
    const made = document.createElement('div')
    made.className = kind === 'pointer' ? 'pm-lecture-pointer' : `pm-lecture-ink pm-lecture-ink--${kind}`
    made.dataset.kind = kind
    Object.assign(made.style, { position: 'absolute', ...STYLES[kind] })
    if (el) el.replaceWith(made)
    else root.append(made)
    el = made
  }
  el.dataset.block = block
  return el
}

function draw(): void {
  frame = 0
  const now = performance.now()
  inks = inks.filter(ink => ink.until === undefined || ink.until > now)
  const root = pointer || inks.length > 0 ? ensureLayer() : layer
  let k = 0
  for (const ink of inks) {
    const block = blockElement(ink.block)
    const box = block && inkBox(ink, block)
    if (!box || !root) continue
    const el = slot(root, k++, ink.tool, ink.block)
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
    if (ink.until !== undefined) el.style.opacity = String(Math.min(1, (ink.until - now) / 400))
  }
  const block = pointer && blockElement(pointer.block)
  if (pointer && block && root) {
    const [, x, y] = pointer.animate ? along(pointer.path, now - pointer.from) : pointer.path.at(-1)!
    const box = block.getBoundingClientRect()
    const dot = slot(root, k++, 'pointer', pointer.block)
    Object.assign(dot.style, { left: `${box.left + x * box.width - 8}px`, top: `${box.top + y * box.height - 8}px` })
  }
  while (root && root.children.length > k) root.lastElementChild!.remove()
  if (pointer || inks.length > 0) frame = requestAnimationFrame(draw)
}

function redraw(): void {
  if (!frame) frame = requestAnimationFrame(draw)
}

export function applyPoint(data: Record<string, unknown>, seeking: boolean): void {
  const points = path(data.path)
  if (typeof data.block !== 'string' || points.length === 0) return
  pointer = { block: data.block, path: points, from: performance.now(), animate: !seeking }
  redraw()
}

export function applyInk(data: Record<string, unknown>, seeking: boolean): void {
  if (data.clear === true) {
    inks = []
    redraw()
    return
  }
  const tool = data.tool === 'laser' ? 'laser' : 'marker'
  if (typeof data.block !== 'string' || (tool === 'laser' && seeking)) return
  const ink: Ink = { block: data.block, tool, ...typeof data.lines === 'string' ? { lines: data.lines } : {}, ...range(data.range) ? { range: range(data.range) } : {} }
  if (!ink.lines && !ink.range) return
  if (tool === 'laser') ink.until = performance.now() + LASER_MS
  inks.push(ink)
  redraw()
}

export function clearPointer(): void {
  pointer = undefined
  redraw()
}

export function clearInks(): void {
  inks = []
  redraw()
}
