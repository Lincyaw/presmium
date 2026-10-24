import { joinWindows } from '@lincyaw/host'
import type { IRDocument, IRSection, SourcePos } from '@lincyaw/kernel'
import type { App, InjectionKey, Ref, ShallowRef, VNodeChild } from 'vue'
import { computed, inject, ref, shallowRef } from 'vue'
import { applyUpdate, clampPosition, footnoteSections, keepPosition, nextPosition, prevPosition } from '../domain/index.ts'
import type { LiveUpdate, Position } from '../domain/index.ts'
import { findView } from './registry.ts'

export interface ViewerOptions {
  renderer?: string
  /** The page shows only the slides (the slides form): its presentation has no page to go back to. */
  slidesOnly?: boolean
  sectionHref?(id: string): string
  sectionHeading?(section: IRSection, step: number): VNodeChild
  diagnostics?: boolean
  navigate?(position: Position): void
  openPresenter?(position: Position): void
  openSource?(source: SourcePos): void
}

export interface Viewer {
  readonly doc: Readonly<ShallowRef<IRDocument>>
  readonly view: Readonly<Ref<string>>
  readonly pageView: Readonly<Ref<string>>
  readonly position: Readonly<ShallowRef<Position>>
  readonly restoring: Ref<boolean>
  readonly options: ViewerOptions & { renderer: string }
  section(id: string): IRSection | undefined
  footnoteHref(identifier: string): string
  go(position: Position, remote?: boolean): void
  show(position: Position): void
  next(): boolean
  prev(): boolean
  setView(id: string): void
  update(update: LiveUpdate): void
  replace(doc: IRDocument): void
}

export const VIEWER: InjectionKey<Viewer> = Symbol('presmium.viewer')

export function footnoteId(identifier: string): string {
  return `fn-${identifier}`
}

const CHANNEL = 'presmium.viewer.position'

export function createViewer(initial: IRDocument, options: ViewerOptions = {}): Viewer {
  const doc = shallowRef(initial)
  const view = ref('document')
  const pageView = ref('document')
  const position = shallowRef<Position>(clampPosition(initial, { section: initial.sections[0]?.id ?? '', step: 0 }))
  const restoring = ref(false)
  const presenting = () => findView(view.value)?.kind === 'overlay'
  const footnotes = computed(() => footnoteSections(doc.value))
  const windows = joinWindows(`${CHANNEL}:${initial.meta.title}`, (value) => {
    if (presenting()) viewer.go(value as Position, true)
  }, () => undefined)
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
      const target = findView(id)
      // The slides alone have no page to show.
      if (!target || id === view.value || (options.slidesOnly && target.kind === 'page')) return
      view.value = id
      if (target.kind === 'page') pageView.value = id
      restoring.value = true
    },
    update: update => replace(applyUpdate(doc.value, update)),
    replace,
  }
  return viewer
}

export function provideViewer(app: App, viewer: Viewer): void {
  app.provide(VIEWER, viewer)
}

export function useViewer(): Viewer {
  const viewer = inject(VIEWER, undefined)
  if (!viewer) throw new Error('[presmium] no viewer: call installViewer(app, viewer) first')
  return viewer
}
