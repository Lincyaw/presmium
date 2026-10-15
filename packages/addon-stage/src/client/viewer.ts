/**
 * The audience screen (P-03) in the web form's present view: `b` blacks it
 * out, `f` freezes it while the presenter moves on; the same key again
 * restores it. The mode is shared presentation state of the IR runtime, so
 * the present view (the audience window) and the presenter window follow
 * each other; the presenter window shows a reminder instead.
 */
import type { Component } from 'vue'
import { defineComponent, h, shallowRef, watch } from 'vue'
import { SCREEN_KEY, screenMode, toggleScreen } from '../domain/index.ts'
import type { ScreenMode } from '../domain/index.ts'
import { messages } from './messages.ts'

/** What the stage uses of the IR runtime's viewer (`Viewer` of @presmium/viewer). */
interface SharedState {
  readonly shared: Readonly<Record<string, unknown>>
  share(key: string, value: unknown): void
}

/** What the stage uses of the viewer plugin context (`ViewerPluginContext` of @presmium/viewer). */
export interface StageViewerContext {
  registerAction(action: { id: string, keys: readonly string[], run(viewer: SharedState): boolean | void }): void
  registerLayer(layer: { id: string, component: Component }): void
  useViewer(): SharedState
}

function toggle(viewer: SharedState, wanted: Exclude<ScreenMode, 'live'>): void {
  viewer.share(SCREEN_KEY, toggleScreen(screenMode(viewer.shared[SCREEN_KEY]), wanted))
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
const screenLayer = (useViewer: () => SharedState): Component => defineComponent({
  name: 'PmStageScreen',
  props: { view: { type: String, required: true } },
  setup(props) {
    const viewer = useViewer()
    const frame = shallowRef<HTMLElement>()
    const mode = () => screenMode(viewer.shared[SCREEN_KEY])
    // Synchronously, so the copy shows the slide before a position that follows the freeze arrives.
    watch([mode, frame], ([current, el]) => {
      if (!el) return
      if (current === 'frozen') freeze(el)
      else el.replaceChildren()
    }, { flush: 'sync', immediate: true })
    return () => {
      const current = mode()
      if (props.view === 'presenter') {
        return current === 'live' ? null : h('div', {
          'class': 'pm-stage-badge',
          'data-mode': current,
          'style': { position: 'absolute', top: '0.75rem', right: '0.75rem', zIndex: 10, padding: '0.25rem 0.75rem', borderRadius: '9999px', background: current === 'frozen' ? '#2563eb' : '#111', color: '#fff', fontSize: '0.9rem', pointerEvents: 'none' },
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
export default function stageViewerPlugin({ registerAction, registerLayer, useViewer }: StageViewerContext): void {
  registerAction({ id: 'presmium.stage.black', keys: ['b'], run: viewer => toggle(viewer, 'black') })
  registerAction({ id: 'presmium.stage.freeze', keys: ['f'], run: viewer => toggle(viewer, 'frozen') })
  registerLayer({ id: 'presmium.stage.screen', component: screenLayer(useViewer) })
}
