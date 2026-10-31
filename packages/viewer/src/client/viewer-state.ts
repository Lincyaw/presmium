import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { createStore, joinWindows } from '@lincyaw/host'
import type { Store } from '@lincyaw/host'
import { PREVIEW_REVISION } from '@lincyaw/kernel'
import type { IRDocument, IRSection, SourcePos } from '@lincyaw/kernel'
import { applyUpdate, clampPosition, footnoteSections, keepPosition, nextPosition, prevPosition } from '../domain/index.ts'
import type { LiveUpdate, Position } from '../domain/index.ts'
import { findView } from './registry.ts'
export interface ViewerOptions { renderer?: string, embedded?: boolean, externalControls?: boolean, documentIdentity?: string, editingActive?: Store<boolean>, confirmedRevision?: Store<string | undefined>, slidesOnly?: boolean, pageLink?(position: Position): { href: string, label: string } | undefined, sectionHref?(id: string): string, sectionHeading?(section: IRSection, step: number): ReactNode, diagnostics?: boolean, navigate?(position: Position): void, openPresenter?(position: Position): void, openSource?(source: SourcePos): void, refreshPresentation?(): void, exitPresentation?(): void }
export interface Viewer {
  doc: Store<IRDocument>, view: Store<string>, pageView: Store<string>, position: Store<Position>, restoring: Store<boolean>, options: ViewerOptions & { renderer: string },
  section(id: string): IRSection | undefined, footnoteHref(identifier: string): string,
  go(position: Position, remote?: boolean): void, show(position: Position): void, next(): boolean, prev(): boolean, setView(id: string): void, update(update: LiveUpdate): void, replace(doc: IRDocument): void,
}
/** A live presentation opens only the revision explicitly confirmed by its embedding author. */
export function presentationConfirmed(viewer: Viewer): boolean {
  const confirmed = viewer.options.confirmedRevision
  return !confirmed || Boolean(confirmed.getSnapshot() && confirmed.getSnapshot() === viewer.doc.getSnapshot().meta[PREVIEW_REVISION])
}
export const VIEWER = createContext<Viewer | undefined>(undefined)
export const footnoteId = (identifier: string) => `fn-${identifier}`
export function createViewer(initial: IRDocument, options: ViewerOptions = {}): Viewer {
  const doc = createStore(initial), view = createStore('document'), pageView = createStore('document'), position = createStore(clampPosition(initial, { section: initial.sections[0]?.id ?? '', step: 0 })), restoring = createStore(false)
  const presenting = () => findView(view.getSnapshot())?.kind === 'overlay'
  const windows = joinWindows(`presmium.viewer.position:${initial.meta.title}`, value => { if (presenting()) viewer.go(value as Position, true) }, () => undefined)
  const replace = (next: IRDocument) => { const kept = keepPosition(doc.getSnapshot(), next, position.getSnapshot()); doc.set(next); position.set(kept) }
  const viewer: Viewer = {
    doc, view, pageView, position, restoring, options: { ...options, renderer: options.renderer ?? 'web' }, section: id => doc.getSnapshot().sections.find(s => s.id === id),
    footnoteHref(identifier) { const anchor = `#${footnoteId(identifier)}`; const section = footnoteSections(doc.getSnapshot()).get(identifier); return section && options.sectionHref ? `${options.sectionHref(section).split('#')[0]}${anchor}` : anchor },
    go(target, remote = false) { const next = clampPosition(doc.getSnapshot(), target); const before = position.getSnapshot(); if (before.section === next.section && before.step === next.step && before.boundary === next.boundary) return; position.set(next); if (!remote && presenting()) windows?.send(next) },
    show(target) {
      const before = position.getSnapshot()
      viewer.go(target)
      // Explicitly selecting the current step also pauses and repositions an
      // active lecture through the existing navigation operation subscribers.
      if (position.getSnapshot() === before) position.set({ ...before })
      if (!presenting()) restoring.set(true)
    },
    next() { const next = nextPosition(doc.getSnapshot(), position.getSnapshot()); if (next) viewer.go(next); return Boolean(next) },
    prev() { const next = prevPosition(doc.getSnapshot(), position.getSnapshot()); if (next) viewer.go(next); return Boolean(next) },
    setView(id) { const target = findView(id); if (!target || id === view.getSnapshot() || (options.slidesOnly && target.kind === 'page')) return; view.set(id); if (target.kind === 'page') pageView.set(id); restoring.set(true) },
    update: update => replace(applyUpdate(doc.getSnapshot(), update)), replace,
  }
  return viewer
}
export function useViewer(): Viewer { const viewer = useContext(VIEWER); if (!viewer) throw new Error('[presmium] no viewer provider'); return viewer }
