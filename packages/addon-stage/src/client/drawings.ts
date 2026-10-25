import { createDrauu } from '@drauu/core'
import type { Drauu } from '@drauu/core'
import { createStore, getSharedStateStore, serverClient, useStore } from '@lincyaw/host'
import type { useViewer } from '@lincyaw/viewer'
import { createElement as h, useEffect, useRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { DRAWINGS_KEY, DRAWINGS_ROUTE, INKS, PEN_WIDTH, STAGE_ID } from '../domain/index.ts'
import type { PenMode } from '../domain/index.ts'
import { messages } from './locale.ts'
const pen = createStore({ on: false, ink: INKS[0] as string, mode: 'stylus' as PenMode })
const pads = new Map<string, { pad: Drauu, commit(): void }>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let loaded = false
const drawingsState = () => getSharedStateStore<Record<string, string>>(DRAWINGS_KEY, {}, { scope: 'remote' })
function loadSaved(): void {
  const server = serverClient(), drawings = drawingsState()
  if (loaded || !server.available) return
  loaded = true
  void server.fetch(STAGE_ID, DRAWINGS_ROUTE).then(response => response.ok ? response.json() as Promise<Record<string, string>> : {}).then(saved => drawings.set(current => ({ ...saved, ...current }))).catch(() => {})
}
function save(section: string, svg: string): void { const server = serverClient(); if (!server.available) return; clearTimeout(timers.get(section)); timers.set(section, setTimeout(() => { timers.delete(section); void server.fetch(STAGE_ID, `${DRAWINGS_ROUTE}/${encodeURIComponent(section)}`, { method: 'PUT', body: svg }).catch(() => {}) }, 800)) }
export function togglePen(): void { pen.set(value => ({ ...value, on: !value.on })) }
export function drawingLayer(viewerOf: typeof useViewer): ComponentType<{ view: string, section: string }> {
  return function Drawing({ view, section }) {
    const viewer = viewerOf(), position = useStore(viewer.position), currentPen = useStore(pen), drawings = drawingsState(), content = useStore(drawings)[section] ?? ''
    const svg = useRef<SVGSVGElement>(null), pad = useRef<Drauu>()
    useEffect(() => {
      loadSaved()
      if (view === 'print' || !svg.current || svg.current.closest('[inert]')) return
      const current = createDrauu({ el: svg.current, brush: { mode: pen.getSnapshot().mode, color: pen.getSnapshot().ink, size: PEN_WIDTH } }); pad.current = current; current.load(drawings.getSnapshot()[section] ?? '')
      const commit = () => { const value = current.dump(); if (value !== drawings.getSnapshot()[section]) { drawings.set(old => ({ ...old, [section]: value })); save(section, value) } }
      current.on('committed', commit); pads.set(section, { pad: current, commit })
      return () => { if (pads.get(section)?.pad === current) pads.delete(section); current.unmount(); pad.current = undefined }
    }, [view, section])
    useEffect(() => { if (pad.current && content !== pad.current.dump()) pad.current.load(content) }, [content])
    useEffect(() => { if (pad.current) { pad.current.brush = { ...pad.current.brush, color: currentPen.ink }; pad.current.mode = currentPen.mode } }, [currentPen.ink, currentPen.mode])
    return h('svg', { ref: svg, className: 'pm-stage-drawing', 'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: currentPen.on && section === position.section ? 'auto' : 'none', cursor: currentPen.on ? 'crosshair' : undefined, touchAction: currentPen.on ? 'none' : undefined }, ...(view === 'print' ? { dangerouslySetInnerHTML: { __html: content } } : {}) })
  }
}
export function penControls(viewerOf: typeof useViewer): ComponentType {
  return function Pen() {
    const viewer = viewerOf(), position = useStore(viewer.position), currentPen = useStore(pen), t = messages().pen
    const button = (label: string, onClick: () => void, extra: Record<string, unknown> = {}, children?: ReactNode) => h('button', { key: label, type: 'button', className: 'pm-present__button', 'aria-label': label, onClick, ...extra }, children ?? label)
    const current = () => pads.get(position.section)
    if (!currentPen.on) return button(t.draw, togglePen, { 'aria-pressed': false })
    return h('span', {}, button(t.done, togglePen, { 'aria-pressed': true }), ...INKS.map((ink, i) => button(t.ink(i + 1), () => pen.set(old => ({ ...old, ink, mode: 'stylus' })), { 'aria-pressed': currentPen.mode === 'stylus' && currentPen.ink === ink }, h('span', { style: { display: 'block', width: 'var(--pm-size-icon)', height: 'var(--pm-size-icon)', borderRadius: 'var(--pm-radius-pill)', background: ink } }))), button(t.eraser, () => pen.set(old => ({ ...old, mode: 'eraseLine' })), { 'aria-pressed': currentPen.mode === 'eraseLine' }), button(t.undo, () => { const value = current(); if (value?.pad.undo()) value.commit() }), button(t.clear, () => { const value = current(); value?.pad.clear(); value?.commit() }))
  }
}
