import type { ViewerPluginContext } from '@lincyaw/viewer'
import { createElement as h, useLayoutEffect, useRef } from 'react'
import { drawingLayer, penControls, togglePen } from './drawings.ts'
import { messages } from './locale.ts'
import { toggleScreenMode, useScreen } from './screen.ts'
function freeze(frame: HTMLElement): void {
  const present = frame.closest('.pm-present'), slide = present?.querySelector<HTMLElement>('.pm-present__slide')
  if (!present || !slide) return
  const copy = slide.cloneNode(true) as HTMLElement
  for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute('id')
  const outer = present.getBoundingClientRect(), inner = slide.getBoundingClientRect()
  Object.assign(frame.style, { top: `${inner.top - outer.top}px`, left: `${inner.left - outer.left}px`, width: `${inner.width}px`, height: `${inner.height}px`, backgroundColor: getComputedStyle(present).backgroundColor })
  copy.style.margin = '0'; frame.replaceChildren(copy)
}
function ScreenLayer({ view }: { view: string }) {
  const { mode } = useScreen(), frame = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (!frame.current) return; if (mode === 'frozen') freeze(frame.current); else frame.current.replaceChildren() }, [mode])
  if (view === 'presenter') return mode === 'live' ? null : h('div', { className: 'pm-stage-badge', 'data-mode': mode, style: { position: 'absolute', top: 'var(--pm-space-3)', right: 'var(--pm-space-3)', zIndex: 10, padding: 'var(--pm-space-1) var(--pm-space-3)', borderRadius: 'var(--pm-radius-pill)', background: mode === 'frozen' ? 'var(--pm-color-accent)' : 'var(--pm-color-ink)', color: mode === 'frozen' ? 'var(--pm-color-on-accent)' : 'var(--pm-color-bg)', fontFamily: 'var(--pm-font-sans)', fontSize: 'var(--pm-text-sm)', pointerEvents: 'none' } }, messages().badge[mode])
  return h('div', { ref: frame, className: 'pm-stage-frozen', 'aria-hidden': true, style: { display: mode === 'frozen' ? 'block' : 'none', position: 'absolute', zIndex: 5, overflow: 'hidden' } })
}
function BlackLayer() { const { mode } = useScreen(); return mode === 'black' ? h('div', { className: 'pm-stage-black', style: { position: 'fixed', inset: 0, zIndex: 'var(--pm-z-screen)', background: 'var(--pm-color-terminal-bg)', cursor: 'none' } }) : null }
export default function stageViewerPlugin({ registerAction, registerLayer, useViewer }: ViewerPluginContext): void {
  registerAction({ id: 'presmium.stage.black', keys: ['b'], run: () => toggleScreenMode('black') })
  registerAction({ id: 'presmium.stage.freeze', keys: ['f'], run: () => toggleScreenMode('frozen') })
  registerAction({ id: 'presmium.stage.draw', keys: ['d'], run: () => togglePen() })
  registerLayer({ id: 'presmium.stage.drawing', component: drawingLayer(useViewer), views: ['present', 'presenter', 'print'], scope: 'slide' })
  registerLayer({ id: 'presmium.stage.pen', component: penControls(useViewer), scope: 'bar' })
  registerLayer({ id: 'presmium.stage.screen', component: ScreenLayer, scope: 'view' })
  registerLayer({ id: 'presmium.stage.black', component: BlackLayer, views: ['present'], scope: 'viewport' })
}
