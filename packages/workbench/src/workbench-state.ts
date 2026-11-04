import type { CanonicalSource, DiagnosticSnapshot, DocumentsAnswer, FocusReport, IrAnswer, JobsAnswer, PreviewAnchor, PreviewAnswer, PreviewCommand, PreviewPoint, PreviewPosition, PreviewRect, PreviewRenderer, ProductionPlan, ProductionPlaybackState, ReviewSnapshot, RevisionsAnswer, UncommittedFile, VoiceoverJob } from '@lincyaw/kernel'
import type { DocumentSessionState } from './document-session.ts'
import type { Locale } from './messages.ts'

/** `editing`: the canonical document is edited in the parent; `viewing`: a derived snapshot is presented. */
export type WorkbenchMode = 'editing' | 'viewing'

/**
 * How the web form is shown: as a page or as its presentation, whose controls can play a configured lecture.
 * Both share one preview page and switch in place with `go.view`.
 */
export type WebView = 'document' | 'present'

/** A playback key pressed in a preview that the workbench plays: Space, and the left and right arrows. */
export type PlaybackKey = 'play-pause' | 'previous' | 'next'

/** What the author points at in the document: a block (or a section), or a passage selected in it. */
export interface Pointer {
  target: PreviewAnchor
  step?: number
  /** The selected passage. */
  quote?: string
  /** Its box in the preview's viewport; none while it is out of sight. */
  rect?: PreviewRect
  obstacles?: PreviewRect[]
  point?: PreviewPoint
  /** Its text can be edited in place. */
  isEditable: boolean
}

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved', at: string }
  | { kind: 'locked' }
  | { kind: 'failed', message: string }

/** A request for the agent of the conversation: its text and what it is about. */
export interface AgentRequest {
  text: string
  focus: FocusReport[]
}

/** A request for the author to finish and send in the conversation, and what it is about: the host only shows it. */
export interface AgentDraft {
  text: string
  focus: FocusReport[]
}

/** Where the host put a request: the conversation's session and the request's id, which its user message carries. */
export interface AgentAnswer {
  session: string
  request: string
}

export interface WorkbenchState {
  locale: Locale
  authoring?: DocumentSessionState
  /** Unaccepted numeric form input is retained separately from saved canonical timing. */
  hasDocumentTimingDrafts?: boolean
  documentTimingDraftStorageFailure?: boolean
  captionTimingDraftSteps?: string[]
  captionTimingDraftStorageFailure?: boolean
  isDark: boolean
  documents?: DocumentsAnswer
  documentsFailure?: string
  /** The workspace's routes answer 404: `@lincyaw/dsh` is turned off on the plugins page. */
  isBundleDisabled?: boolean
  document?: string
  ir?: IrAnswer
  mode: WorkbenchMode
  previewRenderer: PreviewRenderer
  /** In the web form: the page or the presentation, both in the same page, switched without loading it again. */
  webView: WebView
  previewReload: number
  preview?: PreviewAnswer
  previewFailure?: string
  /** The IR revision the preview shows. */
  previewIrRevision?: string
  isPreparingPresentation?: boolean
  presentationFailure?: string
  presentationSnapshot?: { version: string, fingerprint: string, revision: string, project: number }
  productionPlan?: ProductionPlan
  productionPlayback?: ProductionPlaybackState
  productionFailure?: string
  voiceoverJobs?: VoiceoverJob[]
  voiceoverJobsFailure?: string
  /** A cache refresh that actually changed the current production binding; it never starts playback. */
  voiceoverCacheRefresh?: { source: CanonicalSource, revision: string, sequence: number }
  /** Changes when an acknowledged preview connection is attached or detached, including same-revision reloads. */
  previewConnection: number
  /** Where the preview is: the section the author reads, or the slide and its step. */
  position?: PreviewPosition
  /** Changes on every position intent, including A → B → A, without changing the source. */
  documentPositionToken: string
  /** Explicit author navigation, distinct from the player's passive cursor and frame reload reports. */
  productionNavigationVersion: number
  documentPositionIntent: 'seek' | 'pause'
  /** An explicit source navigation request; scrolling updates position without issuing another request. */
  documentNavigation?: { section: string, block?: string, request: string }
  documentPositionFailure?: 'removed'
  isCreatingPage?: boolean
  isEditingPage?: boolean
  editorHistory?: EditorHistoryState
  isHistoryPreparing?: boolean
  pageEditFailure?: string
  diagnostics?: DiagnosticSnapshot
  isDiagnosticsUnavailable: boolean
  canRepairDiagnostics: boolean
  isRepairingDiagnostics: boolean
  diagnosticsRepairFailure?: string
  pointer?: Pointer
  save: SaveState
  /** What the conversation's agent is told the author points at. */
  focus: FocusReport[]
  isFocusPending: boolean
  focusFailure?: string
  review?: ReviewSnapshot
  history?: RevisionsAnswer
  /** Files changed elsewhere and not yet in the history. */
  outside?: UncommittedFile[]
  historyFailure?: string
  isHistoryBusy: boolean
  isAsking: boolean
  askFailure?: string
  /** What the document can be made into, and its builds and exports (the author's and the AI's). */
  jobs?: JobsAnswer
  jobsFailure?: string
  voiceServiceVersion?: number
  jobPreparing?: { target: string, canCancel: boolean }
}

export interface PreviewSink {
  readonly generation?: number
  readonly capabilities?: readonly PreviewCommand['type'][]
  send(command: PreviewCommand): void
}

export interface EditorHistoryState { section: string, undo: boolean, redo: boolean, field?: boolean }


/** The workbench's state as its parts read and change it. */
export interface WorkbenchStore {
  readonly state: WorkbenchState
  set(patch: Partial<WorkbenchState>): void
}

/** The document the conversation works on: none when no document is open. */
export function selectedDocument(state: WorkbenchState): string | null {
  return state.document ?? null
}

/** Whether the AI is changing the workspace now, or its change waits for the author. */
export function isAgentChanging(state: WorkbenchState): boolean {
  return Boolean(state.review?.engine === 'git' && (state.review.running || state.review.changes.length > 0))
}

