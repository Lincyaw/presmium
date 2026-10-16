import { joinWindows } from '@presmium/host'
import type { IRDocument, IRSection, SourcePos } from '@presmium/kernel'
import type { App, InjectionKey, Ref, ShallowRef, VNodeChild } from 'vue'
import { computed, inject, ref, shallowRef } from 'vue'
import { applyUpdate, clampPosition, footnoteSections, keepPosition, nextPosition, prevPosition } from './domain/index.ts'
import type { LiveUpdate, Position } from './domain/index.ts'
import { getView } from './registry.ts'

export interface ViewerOptions {
  /** Renderer the document was compiled for; its `{hints}` apply. Default `web`. */
  renderer?: string
  /** Link to a section, e.g. its page and anchor. Default `#<id>`. */
  sectionHref?(id: string): string
  /** Extra content in a section's heading, after its title: e.g. a small link to the same place in another form. */
  sectionHeading?(section: IRSection, step: number): VNodeChild
  /** Shows compile diagnostics on the sections they concern (dev servers). */
  diagnostics?: boolean
  /** Called when a page view should show a position that is not on the current page. */
  navigate?(position: Position): void
  /** Opens the presenter window of the present view; default: none. */
  openPresenter?(position: Position): void
  /** Opens a source location in the author's editor (dev servers): each section offers it, Alt+click on a block opens the block's. */
  openSource?(source: SourcePos): void
}

export interface Viewer {
  readonly doc: Readonly<ShallowRef<IRDocument>>
  /** Id of the active view. */
  readonly view: Readonly<Ref<string>>
  /** The active page view, or the last one while an overlay view is shown; leaving an overlay returns to it. */
  readonly pageView: Readonly<Ref<string>>
  /** Current section and step, kept when the view changes. */
  readonly position: Readonly<ShallowRef<Position>>
  /** Set when page views should scroll to `position`: after a view switch or a navigation. */
  readonly restoring: Ref<boolean>
  readonly options: ViewerOptions & { renderer: string }
  section(id: string): IRSection | undefined
  /** Link to a footnote definition, wherever its section is (`#fn-<identifier>` on that section's page). */
  footnoteHref(identifier: string): string
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
  /** Replaces the document, e.g. with the dev server's current one after a reconnection; the position stays where it can. */
  replace(doc: IRDocument): void
}

export const VIEWER: InjectionKey<Viewer> = Symbol('presmium.viewer')

/** Element id of a footnote definition; identifiers are unique in a document, so the id is unique on any page. */
export function footnoteId(identifier: string): string {
  return `fn-${identifier}`
}

/**
 * Presentation windows of the same document follow each other's position
 * (`joinWindows` of @presmium/host: the deck's windows in this browser, by
 * title and base). Other state the windows share is `useSharedState`'s.
 */
const CHANNEL = 'presmium.viewer.position'

/** Creates the runtime state of one IR document. */
export function createViewer(initial: IRDocument, options: ViewerOptions = {}): Viewer {
  const doc = shallowRef(initial)
  const view = ref('document')
  const pageView = ref('document')
  const position = shallowRef<Position>(clampPosition(initial, { section: initial.sections[0]?.id ?? '', step: 0 }))
  const restoring = ref(false)
  const presenting = () => getView(view.value)?.kind === 'overlay'
  const footnotes = computed(() => footnoteSections(doc.value))
  // Undefined in a server render. A window that joins later starts from its own position (its URL).
  const windows = joinWindows(`${CHANNEL}:${initial.meta.title}`, (value) => {
    if (presenting()) viewer.go(value as Position, true)
  }, () => undefined)
  /** A new document; a section that was removed, renamed or shortened moves the position to a valid place nearby. */
  const replace = (next: IRDocument) => {
    const kept = keepPosition(doc.value, next, position.value)
    doc.value = next
    if (kept.section !== position.value.section || kept.step !== position.value.step) position.value = kept
  }

  const viewer: Viewer = {
    doc,
    view,
    pageView,
    position,
    restoring,
    options: { ...options, renderer: options.renderer ?? 'web' },
    section: id => doc.value.sections.find(s => s.id === id),
    footnoteHref(identifier) {
      const anchor = `#${footnoteId(identifier)}`
      const section = footnotes.value.get(identifier)
      return section && options.sectionHref ? `${options.sectionHref(section).split('#')[0]}${anchor}` : anchor
    },
    go(target, remote = false) {
      const next = clampPosition(doc.value, target)
      if (next.section === position.value.section && next.step === position.value.step) return
      position.value = next
      if (!remote && presenting()) windows?.send(next)
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
      const target = getView(id)
      if (!target || id === view.value) return
      view.value = id
      if (target.kind === 'page') pageView.value = id
      restoring.value = true
    },
    update: update => replace(applyUpdate(doc.value, update)),
    replace,
  }
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
