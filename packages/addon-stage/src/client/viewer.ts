/**
 * The audience screen (P-03) in the web form's present view: `b` blacks it
 * out, `f` freezes it while the presenter moves on; the same key again
 * restores it. The mode is the host's shared state (`useScreen`), so the
 * present view (the audience window), the presenter window and the other
 * devices of a classroom follow each other; the presenter window shows a
 * reminder instead.
 */
import type { Component } from 'vue'
import { defineComponent, h, shallowRef, watch } from 'vue'
import { messages } from './messages.ts'
import { useScreen } from './screen.ts'

/** What the stage uses of the viewer plugin context (`ViewerPluginContext` of @presmium/viewer). */
export interface StageViewerContext {
  registerAction(action: { id: string, keys: readonly string[], run(viewer: unknown): boolean | void }): void
  registerLayer(layer: { id: string, component: Component }): void
}

/** A static copy of the slide as it is now, without ids; laid over it while frozen. */
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

/** The layer over the present view (a black screen, a frozen copy) and the presenter window (a reminder). */
const ScreenLayer: Component = defineComponent({
  name: 'PmStageScreen',
  props: { view: { type: String, required: true } },
  setup(props) {
    const { mode } = useScreen()
    const frame = shallowRef<HTMLElement>()
    // Synchronously, so the copy shows the slide before a position that follows the freeze arrives.
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
      return [
        h('div', { 'ref': frame, 'class': 'pm-stage-frozen', 'aria-hidden': 'true', 'style': { display: current === 'frozen' ? 'block' : 'none', position: 'absolute', zIndex: 5, overflow: 'hidden' } }),
        current === 'black' ? h('div', { class: 'pm-stage-black', style: { position: 'fixed', inset: 0, zIndex: 10, background: '#000', cursor: 'none' } }) : null,
      ]
    }
  },
})

/** The viewer plugin (docs/ir.md section 8.2) the web form loads from `src/client/viewer.ts`. */
export default function stageViewerPlugin({ registerAction, registerLayer }: StageViewerContext): void {
  registerAction({ id: 'presmium.stage.black', keys: ['b'], run: () => useScreen().toggle('black') })
  registerAction({ id: 'presmium.stage.freeze', keys: ['f'], run: () => useScreen().toggle('frozen') })
  registerLayer({ id: 'presmium.stage.screen', component: ScreenLayer })
}
