import type { IRDocument, IRSection } from '@presmium/kernel'
import type { App, InjectionKey, Ref, ShallowRef, VNodeChild } from 'vue'
import { inject, ref, shallowRef } from 'vue'
import { applyUpdate, clampPosition, nextPosition, prevPosition } from './domain/index.ts'
import type { LiveUpdate, Position } from './domain/index.ts'
import { getView } from './registry.ts'

export interface ViewerOptions {
  /** Renderer the document was compiled for; its `{hints}` apply. Default `web`. */
  renderer?: string
  /** Link to a section, e.g. its page and anchor. Default `#<id>`. */
  sectionHref?(id: string): string
  /** Extra content at the end of a section, e.g. a link to the same place in another form. */
  sectionFooter?(section: IRSection, step: number): VNodeChild
  /** Shows compile diagnostics on the sections they concern (dev servers). */
  diagnostics?: boolean
  /** Called when a page view should show a position that is not on the current page. */
  navigate?(position: Position): void
  /** Opens the presenter window of the present view; default: none. */
  openPresenter?(position: Position): void
}

export interface Viewer {
  readonly doc: Readonly<ShallowRef<IRDocument>>
  /** Id of the active view. */
  readonly view: Readonly<Ref<string>>
  /** Current section and step, kept when the view changes. */
  readonly position: Readonly<ShallowRef<Position>>
  /** Set when page views should scroll to `position`: after a view switch or a navigation. */
  readonly restoring: Ref<boolean>
  readonly options: ViewerOptions & { renderer: string }
  section(id: string): IRSection | undefined
  /** Moves to a position; `remote` marks a position that came from another window. */
  go(position: Position, remote?: boolean): void
  /** Moves to a position and makes the page view scroll there (or go to its page). */
  show(position: Position): void
  /** Next step or section; false at the end. */
  next(): boolean
  /** Previous step or section; false at the start. */
  prev(): boolean
  setView(id: string): void
  /** Applies a live update from the dev server. */
  update(update: LiveUpdate): void
}

export const VIEWER: InjectionKey<Viewer> = Symbol('presmium.viewer')

/** Presentation windows of the same document follow each other's position. */
const CHANNEL = 'presmium.viewer'

/** Creates the runtime state of one IR document. */
export function createViewer(initial: IRDocument, options: ViewerOptions = {}): Viewer {
  const doc = shallowRef(initial)
  const view = ref('document')
  const position = shallowRef<Position>(clampPosition(initial, { section: initial.sections[0]?.id ?? '', step: 0 }))
  const restoring = ref(false)
  // Browser only: in a server render the channel would keep the process alive.
  const channel = typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(`${CHANNEL}:${initial.meta.title}`)
  const presenting = () => getView(view.value)?.kind === 'overlay'

  const viewer: Viewer = {
    doc,
    view,
    position,
    restoring,
    options: { ...options, renderer: options.renderer ?? 'web' },
    section: id => doc.value.sections.find(s => s.id === id),
    go(target, remote = false) {
      const next = clampPosition(doc.value, target)
      if (next.section === position.value.section && next.step === position.value.step) return
      position.value = next
      if (!remote && presenting()) channel?.postMessage(next)
    },
    show(target) {
      viewer.go(target)
      if (!presenting()) restoring.value = true
    },
    next() {
      const next = nextPosition(doc.value, position.value)
      if (next) viewer.go(next)
      return Boolean(next)
    },
    prev() {
      const prev = prevPosition(doc.value, position.value)
      if (prev) viewer.go(prev)
      return Boolean(prev)
    },
    setView(id) {
      if (!getView(id) || id === view.value) return
      view.value = id
      restoring.value = true
    },
    update(update) {
      doc.value = applyUpdate(doc.value, update)
      // A section that was removed or shortened moves the position to a valid place.
      const clamped = clampPosition(doc.value, position.value)
      if (clamped.section !== position.value.section || clamped.step !== position.value.step) position.value = clamped
    },
  }
  channel?.addEventListener('message', (event: MessageEvent<Position>) => {
    if (presenting()) viewer.go(event.data, true)
  })
  return viewer
}

/** Makes the viewer available to the views and components of an app. */
export function provideViewer(app: App, viewer: Viewer): void {
  app.provide(VIEWER, viewer)
}

/** The viewer of the app; must be called inside a component setup. */
export function useViewer(): Viewer {
  const viewer = inject(VIEWER, undefined)
  if (!viewer) throw new Error('[presmium] no viewer: call installViewer(app, viewer) first')
  return viewer
}
