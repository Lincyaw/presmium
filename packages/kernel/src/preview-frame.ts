import type { PreviewEvents } from './preview-events.ts'
import { PREVIEW_APPEARANCE_PARAM, PREVIEW_NAME, PREVIEW_PARAM } from './contracts/preview.ts'
import type { PreviewAnchor, PreviewCommand, PreviewPosition, PreviewRect, PreviewReport } from './contracts/preview.ts'
import type { ProductionPlaybackCommand, ProductionPlaybackState } from './contracts/production.ts'

/** A source-bound native text draft, owned by the page rather than its DOM adapter. */
export interface PreviewTextEdit {
  target: PreviewAnchor
  before: string
  revision: string
  binding: string
}
export interface PreviewTextHandle {
  change(after: string, composing: boolean): void
  finish(after: string, interrupted?: boolean): void
  cancel(): void
}

/** What a web or slides page gives the preview frame: its position, navigation and DOM. */
export interface PreviewPage {
  renderer: 'web' | 'slides'
  events?: PreviewEvents
  confirmPresentation?(revision: string): void
  document: string
  origins: readonly string[]
  revision(): string | undefined
  position(): PreviewPosition | undefined
  go(command: Extract<PreviewCommand, { type: 'go' }>): void
  reveal(target: PreviewAnchor): void
  setDark(dark: boolean): void
  setActive?(active: boolean): void | Promise<void>
  activityChanged?(active: boolean): void
  /** Finishes only the page's own authored edits; the host confirms its source writes separately. */
  flush?(): void | Promise<void>
  documentHistory?(action: 'undo' | 'redo'): boolean
  resetDocumentHistory?(): void
  /** Visible editor tools that the embedding workbench should leave unobscured. */
  selectionTools?(): PreviewRect[]
  /** Present only when the page can retain text until a request-bound source acknowledgement. */
  nativeText?(edit: PreviewTextEdit): PreviewTextHandle | undefined
  pausePlayback?(): void | Promise<void>
  /** Installs author permission for a formal playback start; never owns a media clock. */
  setPlaybackGate?(authorize: (signal: AbortSignal) => Promise<void>): () => void
  productionPlayback?(command: ProductionPlaybackCommand, signal: AbortSignal): Promise<ProductionPlaybackState>
  subscribeProductionPlayback?(listener: (state: ProductionPlaybackState | undefined) => void): () => void
  sectionOf?(element: Element): string | undefined
  sectionElement?(section: string): HTMLElement | undefined
  seen?(element: Element): boolean
  stepOf?(anchor: Required<PreviewAnchor>): { step: number, trail: string[] } | undefined
}

export interface PreviewProblem {
  level: 'error' | 'warning'
  plugin?: string
  message: string
  resolved?: boolean
}

/** The page's side of the preview protocol, connected to the embedding workbench. */
export interface PreviewFrame {
  moved(): void
  updated(): void
  redraw(): void
  report(problem: PreviewProblem): void
  stop(): void
}

let editorReport: ((message: PreviewReport) => void) | undefined
/** Sends a typed editor operation through the authenticated connection of this preview. */
export function reportPreview(message: PreviewReport): void { editorReport?.(message) }

/** Sends `reportPreview`'s messages with `post`, the connection's (`preview-frame-connect.ts`), until the returned function is called. */
export function routePreviewReports(post: (message: PreviewReport) => void): () => void {
  editorReport = post
  return () => { if (editorReport === post) editorReport = undefined }
}

// A function, not a constant: bundlers keep a module-level template over an imported binding, and static builds must hold no preview code.
const framePrefix = () => `${PREVIEW_NAME}:`
const PAUSED = ':paused'

/** The window's name while it is the workbench's preview with `nonce`, active or paused. */
export function previewWindowName(nonce: string, active: boolean): string {
  return `${framePrefix()}${nonce}${active ? '' : PAUSED}`
}

export function previewNonce(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_PARAM)
  if (given) return given
  if (!window.name.startsWith(framePrefix())) return undefined
  const own = window.name.slice(framePrefix().length)
  return (own.endsWith(PAUSED) ? own.slice(0, -PAUSED.length) : own) || undefined
}

/** The appearance the workbench loaded the preview with, if it said. */
export function previewAppearance(): 'dark' | 'light' | undefined {
  if (typeof window === 'undefined') return undefined
  const given = new URL(window.location.href).searchParams.get(PREVIEW_APPEARANCE_PARAM)
  return given === 'dark' || given === 'light' ? given : undefined
}

/**
 * The Content-Security-Policy that lets only the site itself and the workbench's origins embed a page: a home page
 * that plays a document's presentation in a frame works in `presmium serve` as it does in the built site.
 */
export function previewFrameAncestors(origins: readonly string[]): string {
  return ['frame-ancestors', "'self'", ...origins].join(' ')
}

/** Whether the page is embedded by a workbench as its preview (the frame may still be refused when no origin is allowed). */
export function isPreviewEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window && previewNonce() !== undefined
}

export function isPreviewActive(): boolean {
  if (typeof window === 'undefined' || window.parent === window) return true
  const nonce = previewNonce()
  return !nonce || window.name !== previewWindowName(nonce, false)
}

const STALE_MODULE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

/**
 * A module that failed to load because a new deployment removed the version this (cached) page names: the page asks to
 * load again (`vite:preloadError`, which the page's head answers with one reload). Other failures are left alone.
 */
export function reportStaleModule(error: unknown): void {
  if (typeof window === 'undefined' || !STALE_MODULE.test(String(error instanceof Error ? error.message : error))) return
  window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
}
