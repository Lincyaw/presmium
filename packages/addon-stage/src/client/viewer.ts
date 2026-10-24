import type { ViewerPluginContext } from '@lincyaw/viewer'
import type { Component } from 'vue'
import { defineComponent, h, shallowRef, watch } from 'vue'
import { drawingLayer, penControls, togglePen } from './drawings.ts'
import { messages } from './locale.ts'
import { useScreen } from './screen.ts'

function freeze(frame: HTMLElement): void {
  const present = frame.closest('.pm-present')
  const slide = present?.querySelector<HTMLElement>('.pm-present__slide')
  if (!present || !slide) return
  const copy = slide.cloneNode(true) as HTMLElement
  for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute('id')
  const outer = present.getBoundingClientRect()
  const inner = slide.getBoundingClientRect()
  Object.assign(frame.style, {
    top: `${inner.top - outer.top}px`,
    left: `${inner.left - outer.left}px`,
    width: `${inner.width}px`,
    height: `${inner.height}px`,
    backgroundColor: getComputedStyle(present).backgroundColor,
  })
  copy.style.margin = '0'
  frame.replaceChildren(copy)
}

const ScreenLayer: Component = defineComponent({
  name: 'PmStageScreen',
  props: { view: { type: String, required: true } },
  setup(props) {
    const { mode } = useScreen()
    const frame = shallowRef<HTMLElement>()
    watch([mode, frame], ([current, el]) => {
      if (!el) return
      if (current === 'frozen') freeze(el)
      else el.replaceChildren()
    }, { flush: 'sync', immediate: true })
    return () => {
      const current = mode.value
      if (props.view === 'presenter') {
        return current === 'live' ? null : h('div', {
          'class': 'pm-stage-badge',
          'data-mode': current,
          'style': { position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10, padding: '0.25rem 0.75rem', borderRadius: 'var(--pm-radius-pill)', background: current === 'frozen' ? 'var(--pm-color-accent)' : 'var(--pm-color-ink)', color: current === 'frozen' ? 'var(--pm-color-on-accent)' : 'var(--pm-color-bg)', fontFamily: 'var(--pm-font-sans)', fontSize: '0.9rem', pointerEvents: 'none' },
        }, messages().badge[current])
      }
      return h('div', { 'ref': frame, 'class': 'pm-stage-frozen', 'aria-hidden': 'true', 'style': { display: current === 'frozen' ? 'block' : 'none', position: 'absolute', zIndex: 5, overflow: 'hidden' } })
    }
  },
})

const BlackLayer: Component = defineComponent({
  name: 'PmStageBlack',
  setup() {
    const { mode } = useScreen()
    return () => mode.value === 'black' ? h('div', { class: 'pm-stage-black', style: { position: 'fixed', inset: 0, zIndex: 'var(--pm-z-screen)', background: '#000', cursor: 'none' } }) : null
  },
})

export default function stageViewerPlugin({ registerAction, registerLayer, useViewer }: ViewerPluginContext): void {
  const Drawing = drawingLayer(useViewer)
  const Pen = penControls(useViewer)
  registerAction({ id: 'presmium.stage.black', keys: ['b'], run: () => useScreen().toggle('black') })
  registerAction({ id: 'presmium.stage.freeze', keys: ['f'], run: () => useScreen().toggle('frozen') })
  registerAction({ id: 'presmium.stage.draw', keys: ['d'], run: () => togglePen() })
  registerLayer({ id: 'presmium.stage.drawing', component: Drawing, views: ['present', 'presenter', 'print'], scope: 'slide' })
  registerLayer({ id: 'presmium.stage.pen', component: Pen, scope: 'bar' })
  registerLayer({ id: 'presmium.stage.screen', component: ScreenLayer, scope: 'view' })
  registerLayer({ id: 'presmium.stage.black', component: BlackLayer, views: ['present'], scope: 'viewport' })
}
