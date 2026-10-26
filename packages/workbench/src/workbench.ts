import { undoDepth, redoDepth } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import { DocumentSession } from './document-session.ts'
import type { DocumentSessionState } from './document-session.ts'
import type { NarrationNode, TeachingDocument } from '@lincyaw/kernel'
import type { NativeDocumentEditor } from './document-editor/schema.tsx'
import { nativeTextPoint, nativeTextPosition } from './document-editor/selection.ts'
import type { NativeTextPoint } from './document-editor/selection.ts'
import type { DocumentFieldBookmark, DocumentFieldRegistration } from './document-editor/focus.ts'
import { pageDeletion, removeDocumentPage } from './document-pages.ts'
import { changeStepTiming } from './step-production.ts'
import type { StepDurationDraft, StepDurationKey, StepTimingPatch } from './step-production.ts'
import { DocumentTimingDrafts } from './document-timing-drafts.ts'
import { errorMessage, slideShape, stepKeys, stepTrail, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, Focus, FocusReport, IrAnswer, IrEvent, IRDocument, JobsAnswer, OperationAnswer, PreviewAnchor, PreviewAnswer, PreviewCommand, PreviewDiagnostics, PreviewPoint, PreviewPosition, PreviewRect, PreviewRenderer, PreviewReport, ReviewChange, ReviewSnapshot, RevisionsAnswer, UncommittedFile } from '@lincyaw/kernel'
import { DocumentDiagnostics } from './diagnostics.ts'
import { DocumentHistory } from './history.ts'
import { DocumentJobs } from './jobs.ts'
import { localeOf, MESSAGES } from './messages.ts'
import type { AgentPlace, Locale } from './messages.ts'
import { changedPlaces, findPlaceAtLine, findPlaceSource } from './places.ts'
import { OperationLog } from './telemetry.ts'
import type { OperationValue } from './telemetry.ts'
import { PreviewPlayback } from './preview-playback.ts'
import { workspaceClient, WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import type { PageDeletePlan } from '@lincyaw/kernel'

/** `editing`: the canonical document is edited in the parent; `viewing`: a derived snapshot is presented. */
export type WorkbenchMode = 'editing' | 'viewing'

/**
 * How the web form is shown: as a page or as its presentation, whose controls can play a configured lecture.
 * Both share one preview page and switch in place with `go.view`.
 */
export type WebView = 'document' | 'present'

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
  /** Where the preview is: the section the author reads, or the slide and its step. */
  position?: PreviewPosition
  /** Changes on every position intent, including A → B → A, without changing the source. */
  documentPositionToken: string
  documentPositionIntent: 'seek' | 'pause'
  /** An explicit source navigation request; scrolling updates position without issuing another request. */
  documentNavigation?: { section: string, request: string }
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
}

export interface PreviewSink {
  readonly generation?: number
  readonly capabilities?: readonly PreviewCommand['type'][]
  send(command: PreviewCommand): void
}

export interface EditorHistoryState { section: string, undo: boolean, redo: boolean }

type Listener = () => void

/** The workbench's state as its parts read and change it. */
export interface WorkbenchStore {
  readonly state: WorkbenchState
  set(patch: Partial<WorkbenchState>): void
}

// The export of the lecture as a video (`@lincyaw/addon-lecture`).
export const VIDEO_TARGET = 'video'

/** The document the conversation works on: none when no document is open. */
export function selectedDocument(state: WorkbenchState): string | null {
  return state.document ?? null
}

/** Whether the AI is changing the workspace now, or its change waits for the author. */
export function isAgentChanging(state: WorkbenchState): boolean {
  return Boolean(state.review && (state.review.running || state.review.changes.length > 0))
}

/** Whether the document has a slides form (no renderers listed: every form). */
export function hasSlides(ir: IrAnswer | undefined): boolean {
  const renderers = ir?.doc.config.renderers
  return !renderers || Object.keys(renderers).length === 0 || 'slides' in renderers
}

/** The width of the document's slides over their height (`renderers.slides.aspectRatio`), 16:9 by default. */
export function slideAspect(ir: IrAnswer | undefined): number {
  if (!ir) return 16 / 9
  const { width, height } = slideShape(ir.doc)
  return width / height
}

/** What opening or closing a document clears. */
const DOCUMENT_RESET = {
  mode: 'editing',
  authoring: undefined,
  isCreatingPage: false,
  isEditingPage: false,
  editorHistory: undefined,
  isHistoryPreparing: false,
  pageEditFailure: undefined,
  ir: undefined, preview: undefined, previewFailure: undefined, previewIrRevision: undefined, position: undefined, documentNavigation: undefined,
  diagnostics: undefined, isDiagnosticsUnavailable: false, isRepairingDiagnostics: false, diagnosticsRepairFailure: undefined,
  pointer: undefined, save: { kind: 'idle' },
  focus: [], isFocusPending: false, focusFailure: undefined,
  review: undefined, history: undefined, outside: undefined, historyFailure: undefined, isHistoryBusy: false, askFailure: undefined,
  jobs: undefined, jobsFailure: undefined,
} satisfies Partial<WorkbenchState>

/** A free directory for a new document called `title`, beside most of the existing ones. */
export function documentDirFor(title: string, taken: readonly string[]): string {
  const parents = new Map<string, number>()
  for (const dir of taken) {
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
    parents.set(parent, (parents.get(parent) ?? 0) + 1)
  }
  const parent = [...parents].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const slug = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'document'
  const base = parent ? `${parent}/${slug}` : slug
  let dir = base
  for (let n = 2; taken.includes(dir); n++) dir = `${base}-${n}`
  return dir
}

/**
 * The state of the workbench and its actions: the documents, the open document's preview, what the author points at
 * in it; canonical source editing, diagnostics and history are parts of their own
 * (`diagnostics.ts`, `history.ts`).
 */
export class Workbench {
  readonly client: WorkspaceClient
  readonly #documentSession: DocumentSession
  readonly #documentTimingDrafts = new DocumentTimingDrafts()
  readonly #removedCueTimings = new Map<string, { pauseMs: number }>()
  #cueTimingScope?: string
  #documentEditor?: NativeDocumentEditor
  #unsubscribeEditor?: () => void
  #unsubscribeDocumentSelection?: () => void
  #documentSelectionGeneration = 0
  #pendingDocumentFocus?: { documentId: string, nodeId: string, generation: number }
  #pendingDocumentSelection?: { documentId: string, anchor: NativeTextPoint, head: NativeTextPoint, focused: boolean }
  readonly #documentFields = new Map<string, DocumentFieldRegistration>()
  #pendingDocumentField?: { field: Omit<DocumentFieldRegistration, 'focus'>, bookmark: DocumentFieldBookmark, reset: number, generation: number }
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #positionSeed = Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-')
  #positionSequence = 0
  readonly #selectedSteps = new Map<string, number>()
  #pendingGo?: { document: string | undefined, command: Extract<PreviewCommand, { type: 'go' }> }
  readonly #diagnostics: DocumentDiagnostics
  readonly #history: DocumentHistory
  readonly #jobs: DocumentJobs
  readonly #askers = new Set<(request: AgentRequest) => Promise<AgentAnswer | void>>()
  readonly #previewSinks = new Set<PreviewSink>()
  #unsubscribeIr?: () => void
  #runtimeDocument?: string
  #jobsDocument?: string
  readonly #jobObservers = new Set<symbol>()
  #previewReads = 0
  #irReads = 0
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #documentScope = 0
  readonly #playback = new PreviewPlayback(() => ({ document: this.#state.document, scope: this.#documentScope, sinks: this.#previewSinks }))
  /** A place to show that no preview could take yet (none was attached, e.g. the chat covered the document). */
  #pendingReveal?: PreviewAnchor
  /** The AI's changes to show on the document once the preview has them. */
  #pendingFlash?: ReviewChange[]
  #lastPosition?: string
  #awaitingView?: WebView
  /** The forms asked for ahead of the author (`web:<dir>`, `slides:<dir>`), and the wait before asking for the slides. */
  /** What the author does, for the operator's collector when the host has one. */
  readonly telemetry: OperationLog

  constructor(options: { client?: WorkspaceClient, locale?: Locale, isDark?: boolean } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language),
      isDark: options.isDark ?? false,
      mode: 'editing',
      previewRenderer: 'web',
      webView: 'document',
      previewReload: 0,
      documentPositionToken: this.#nextDocumentPosition(),
      documentPositionIntent: 'seek',
      isDiagnosticsUnavailable: false,
      canRepairDiagnostics: false,
      isRepairingDiagnostics: false,
      save: { kind: 'idle' },
      focus: [],
      isFocusPending: false,
      isHistoryBusy: false,
      isAsking: false,
    }
    const workbench = this
    const store: WorkbenchStore = {
      get state() {
        return workbench.#state
      },
      set: patch => workbench.#set(patch),
    }
    this.#documentSession = new DocumentSession(this.client, authoring => {
      if (this.#state.document !== authoring.directory) return
      const pendingField = this.#pendingDocumentField
      if (pendingField && (pendingField.field.identity !== authoring.identity || authoring.reset > pendingField.reset || !authoring.content?.blocks[pendingField.field.blockId])) this.#pendingDocumentField = undefined
      const cueTimingScope = JSON.stringify([authoring.identity, authoring.reset])
      if (this.#cueTimingScope !== cueTimingScope) { this.#removedCueTimings.clear(); this.#cueTimingScope = cueTimingScope }
      const previous = this.#state.authoring
      this.#set({ authoring,
        hasDocumentTimingDrafts: Boolean(authoring.identity && authoring.content && this.#documentTimingDrafts.has(authoring.identity, authoring.content)),
        documentTimingDraftStorageFailure: this.#documentTimingDrafts.failed,
        save: authoring.error ? { kind: 'failed', message: authoring.error } : authoring.saving ? { kind: 'saving' } : !authoring.dirty && previous?.dirty ? { kind: 'saved', at: new Date().toISOString() } : this.#state.save.kind === 'failed' ? { kind: 'idle' } : this.#state.save })
      if (!authoring.dirty && previous?.dirty) { void this.#history.read(authoring.directory); void this.loadDocuments() }
    })
    this.#diagnostics = new DocumentDiagnostics(this.client, store)
    this.#jobs = new DocumentJobs(this.client, store)
    this.#history = new DocumentHistory(this.client, store, (changes) => {
      this.#record('ai.change', { 'presmium.files': changes.map(change => change.path).join('\n'), 'presmium.added': changes.reduce((n, c) => n + c.added, 0), 'presmium.removed': changes.reduce((n, c) => n + c.removed, 0) })
      this.#pendingFlash = changes
      this.#flashChanges()
    })
    this.telemetry = new OperationLog(() => this.client.readTelemetry(), (batch, beacon) => this.client.sendTelemetry(batch, beacon), this.#state.locale)
    void this.telemetry.start()
  }

  /** Records an operation of the author, with the document, the view and the mode it was done in. */
  #record(name: string, attributes: Record<string, OperationValue> = {}): void {
    this.telemetry.record(name, { 'presmium.document': this.#state.document, 'presmium.view': this.#state.previewRenderer, 'presmium.mode': this.#state.mode, ...attributes })
  }

  /** Does an operation that takes time and records it once done, with its outcome and how long it took. */
  async #timed<T>(name: string, attributes: Record<string, OperationValue>, work: () => Promise<T>, outcome: (value: T) => string = () => 'done'): Promise<T> {
    const started = Date.now()
    try {
      const value = await work()
      this.#record(name, { ...attributes, 'presmium.outcome': outcome(value), 'presmium.ms': Date.now() - started })
      return value
    } catch (error) {
      this.#record(name, { ...attributes, 'presmium.outcome': 'failed', 'presmium.error': errorMessage(error), 'presmium.ms': Date.now() - started })
      throw error
    }
  }

  get state(): WorkbenchState {
    return this.#state
  }

  getState = (): WorkbenchState => this.#state

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  onRepairDiagnostics = (repairer: (diagnostics: readonly Diagnostic[]) => void | Promise<void>): (() => void) => this.#diagnostics.onRepair(repairer)

  requestRepairDiagnostics(): Promise<void> {
    this.#record('diagnostics.repair')
    return this.#diagnostics.requestRepair()
  }

  /** The host's way to hand a request to the conversation's agent. */
  onAgentRequest = (asker: (request: AgentRequest) => Promise<AgentAnswer | void>): (() => void) => {
    this.#askers.add(asker)
    return () => this.#askers.delete(asker)
  }

  #nextDocumentPosition(): string { return `${this.#positionSeed}:${++this.#positionSequence}` }

  #set(patch: Partial<WorkbenchState>): void {
    this.#state = { ...this.#state, ...patch, ...Object.hasOwn(patch, 'position') ? { documentPositionToken: this.#nextDocumentPosition(), documentPositionIntent: patch.documentPositionIntent ?? 'seek' } : {} }
    for (const listener of this.#listeners) listener()
  }

  get #messages() {
    return MESSAGES[this.#state.locale]
  }

  setLocale(locale: Locale): void {
    if (locale === this.#state.locale) return
    this.#set({ locale })
    this.#record('locale.set', { 'presmium.locale': locale })
  }

  setDark(isDark: boolean): void {
    if (isDark === this.#state.isDark) return
    this.#set({ isDark })
    this.#broadcast({ type: 'appearance', dark: isDark })
    this.#record('appearance.set', { 'presmium.dark': isDark })
  }

  async loadDocuments(): Promise<void> {
    try {
      this.#set({ documents: await this.client.readDocuments(), documentsFailure: undefined, isBundleDisabled: false })
    } catch (error) {
      this.#set({ documentsFailure: errorMessage(error), isBundleDisabled: error instanceof WorkspaceServerError && error.status === 404 })
    }
  }

  operateDocument(operation: DocumentOperation): Promise<OperationAnswer> {
    const attributes = Object.fromEntries(Object.entries(operation).filter(([, value]) => typeof value === 'string').map(([key, value]) => [`presmium.op.${key}`, value as string]))
    return this.#timed(`document.${operation.op}`, attributes, async () => {
      const answer = await this.client.operateDocument(operation)
      if (operation.op !== 'create' && operation.op !== 'copy' && this.#state.document === operation.dir) this.closeDocument()
      await this.loadDocuments()
      return answer
    })
  }

  /** Makes a document called `title` from the template, in a directory of its own; answers the directory. */
  async createDocument(title: string, template?: string): Promise<string> {
    const taken = this.#state.documents?.documents.map(doc => doc.dir) ?? []
    const answer = await this.operateDocument({ op: 'create', dir: documentDirFor(title, taken), title, ...template ? { template } : {} })
    return answer.dir!
  }

  /** Copies a document; the copy is called `title`. */
  async copyDocument(dir: string, title: string): Promise<string> {
    const taken = this.#state.documents?.documents.map(doc => doc.dir) ?? []
    let to = `${dir}-copy`
    for (let n = 2; taken.includes(to); n++) to = `${dir}-copy-${n}`
    const answer = await this.operateDocument({ op: 'copy', dir, to })
    await this.retitleDocument(answer.dir ?? to, title)
    return answer.dir ?? to
  }

  /** Changes canonical document metadata through the same versioned transaction as the editor. */
  retitleDocument(dir: string, title: string): Promise<void> {
    return this.#timed('document.retitle', { 'presmium.op.dir': dir, 'presmium.title': title }, async () => {
      const source = await this.client.readDocument(dir)
      await this.client.changeDocument(dir, { id: crypto.randomUUID(), baseDocumentVersion: source.version, replacement: { ...source.content, metadata: { ...source.content.metadata, title } } })
      await this.loadDocuments()
      if (this.#state.document === dir) void this.#history.read(dir)
    })
  }

  async openDocument(dir: string): Promise<void> {
    if (this.#state.document === dir) return
    this.#documentScope++
    this.#stopSubscriptions()
    this.#history.subscribeReview(dir)
    this.#set({ ...DOCUMENT_RESET, document: dir, previewRenderer: 'web', webView: 'document' })
    this.#record('document.open')
    this.#diagnostics.subscribe(dir)
    // Authoring is ready from source JSON; compilation and preview are independent.
    await Promise.all([this.#documentSession.open(dir), this.#readFocus(dir), this.#history.read(dir)])

  }

  closeDocument(): void {
    this.#documentScope++
    if (this.#state.document !== undefined) this.#record('document.close')
    this.#stopSubscriptions()
    this.#documentSession.close()
    this.#set({ ...DOCUMENT_RESET, document: undefined })
    void this.loadDocuments()
  }

  async #readFocus(dir: string): Promise<void> {
    const version = this.#focusVersion
    try {
      const answer = await this.client.readFocus(dir)
      if (this.#state.document === dir && version === this.#focusVersion) this.#set({ focus: answer.focus ?? [] })
    } catch {
    }
  }

  async #readIr(dir: string): Promise<void> {
    const read = ++this.#irReads
    try {
      const ir = await this.client.readIr(dir)
      if (this.#state.document === dir && read === this.#irReads) {
        this.#set({ ir })
        this.#flashChanges()
      }
    } catch {
    }
  }

  /**
   * Makes the blocks the AI changed blink on the document, once the preview shows the revision the workbench has: the
   * author sees what changed where they read it, not as files.
   */
  #flashChanges(): void {
    const changes = this.#pendingFlash
    const ir = this.#state.ir
    if (!changes || !ir || this.#state.previewIrRevision !== ir.revision || this.#previewSinks.size === 0) return
    this.#pendingFlash = undefined
    const targets = changedPlaces(ir.doc, changes)
    if (targets.length === 0) return
    this.#broadcast({ type: 'flash', targets })
    this.#record('ai.change.shown', { 'presmium.places': targets.map(target => [target.section, target.block].filter(Boolean).join(':')).join('\n') })
  }

  retryDiagnostics(): void {
    this.#record('diagnostics.retry')
    this.#diagnostics.retry()
  }

  reportPreviewDiagnostics(report: PreviewDiagnostics): Promise<void> {
    return this.#diagnostics.reportPreview(report)
  }

  async #readPreview(dir: string): Promise<void> {
    const read = ++this.#previewReads
    const renderer = this.#state.previewRenderer
    const current = () => this.#state.document === dir && this.#state.previewRenderer === renderer && read === this.#previewReads
    try {
      const preview = await this.client.readPreview(dir, renderer, AbortSignal.timeout(45_000))
      if (current()) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (current()) this.#set({ previewFailure: error instanceof Error && error.name === 'TimeoutError' ? this.#messages.previewPrepareTimeout : errorMessage(error) })
    }
  }

  async #handleIrEvent(dir: string, event: IrEvent): Promise<void> {
    if (this.#state.document !== dir) return
    const renderers = this.#state.ir?.doc.config.renderers
    if (event.revision !== this.#state.ir?.revision) {
      await this.#readIr(dir)
      // Opening the document and its initial SSE snapshot share one request.
      // A save can arrive while that request still describes the previous revision.
      if (this.#state.document === dir && event.revision !== this.#state.ir?.revision) await this.#readIr(dir)
    }
    if (this.#state.document !== dir) return
    // The view switch goes with the slides: a document that lost them shows its web form.
    if (this.#state.previewRenderer === 'slides' && !hasSlides(this.#state.ir)) this.setPreviewRenderer('web')
    else if (renderers && JSON.stringify(renderers) !== JSON.stringify(this.#state.ir?.doc.config.renderers)) void this.#readPreview(dir)
    if (event.files.length > 0) void this.#history.read(dir)
  }

  setMode(mode: WorkbenchMode): void {
    if (mode === this.#state.mode) return
    this.#set({ mode })
    this.#record('mode.set')
    this.point(undefined)
    this.#broadcast({ type: 'pick', on: false })
  }

  setPreviewRenderer(renderer: PreviewRenderer): void {
    if (renderer === this.#state.previewRenderer) return
    this.#set({ previewRenderer: renderer, preview: undefined, previewFailure: undefined, previewIrRevision: undefined, pointer: undefined })
    this.#record('view.set')
    this.#syncRuntimeStreams()
    const document = this.#state.document
    if (document !== undefined) void this.#readPreview(document)
  }

  /**
   * Shows the web form as a page or as its presentation. The page is the same (and stays loaded): the view changes there,
   * at the place the author is; from the slides, the web form is shown first.
   */
  setWebView(view: WebView): void {
    if (view === this.#state.webView && this.#state.previewRenderer === 'web') return
    this.#awaitingView = view
    this.#set({ webView: view })
    this.#syncRuntimeStreams()
    this.#record('view.set', { 'presmium.preview.view': view })
    if (this.#state.previewRenderer !== 'web') {
      this.setPreviewRenderer('web')
    } else { if (view === 'present' && this.#state.document !== undefined) void this.#readPreview(this.#state.document); this.#showWebView() }
  }

  /** Source editing never owns IR or job streams. Export and presentation share one optional runtime stream. */
  #syncRuntimeStreams(): void {
    const document = this.#state.document
    const jobs = document !== undefined && this.#jobObservers.size > 0
    const runtime = document !== undefined && !jobs && (this.#state.webView === 'present' || this.#state.previewRenderer === 'slides')
    if (!runtime || this.#runtimeDocument !== document) {
      this.#unsubscribeIr?.(); this.#unsubscribeIr = undefined; this.#runtimeDocument = undefined
    }
    if (!jobs || this.#jobsDocument !== document) { this.#jobs.stop(); this.#jobsDocument = undefined }
    if (jobs && this.#jobsDocument !== document) { this.#jobsDocument = document; this.#jobs.subscribe(document!) }
    if (runtime && !this.#unsubscribeIr) {
      this.#runtimeDocument = document
      this.#unsubscribeIr = this.client.subscribeIr(document!, event => void this.#handleIrEvent(document!, event), () => void this.#readIr(document!))
      void this.#readIr(document!)
    }
  }

  /** Follows export status only while a consumer is visible; it displaces the optional IR stream. */
  observeJobs(): () => void {
    const token = Symbol('exports')
    this.#jobObservers.add(token)
    this.#syncRuntimeStreams()
    if (this.#state.document !== undefined) void this.#readIr(this.#state.document)
    return () => { if (this.#jobObservers.delete(token)) this.#syncRuntimeStreams() }
  }

  #showWebView(sinks: Iterable<PreviewSink> = this.#previewSinks): void {
    const selected = this.#state.position
    const section = selected?.section ?? this.#state.ir?.doc.sections[0]?.id ?? this.#state.authoring?.content?.sectionOrder[0]
    if (section === undefined) return
    for (const sink of sinks) sink.send({ type: 'go', section, step: selected?.step ?? 0, view: this.#state.webView })
  }

  reloadPreview(): void {
    this.#record('preview.reload')
    this.#reloadPreview()
  }

  #reloadPreview(): void {
    this.#set({ previewReload: this.#state.previewReload + 1 })
    const address = this.#state.previewRenderer === 'slides' ? this.#state.preview?.slides : this.#state.preview?.web
    if (!address) this.retryPreview()
  }

  retryPreview(): void {
    this.#record('preview.retry')
    if (this.#state.document !== undefined) void this.#readPreview(this.#state.document)
  }

  #pageEditMessage(reason: string): string {
    const t = this.#messages
    if (reason === 'native-unavailable') return t.nativeEditUnavailable
    if (reason.startsWith('native-')) return t.nativeEditDraft
    switch (reason) {
      case 'page-multiple-files': return t.pageEditFiles
      case 'page-boundary': return t.pageEditBoundary
      case 'page-hierarchy': return t.pageEditHierarchy
      case 'page-implicit-title': return t.pageEditImplicitTitle
      case 'page-formatted-title': return t.pageEditFormattedTitle
      case 'page-title': return t.pageEditInvalidTitle
      case 'page-compiler': return t.pageEditCompiler
      case 'page-referenced': return t.pageDeleteReferenced
      case 'page-external-bindings': return t.pageDeleteExternalBindings
      case 'page-references-unavailable': return t.pageDeleteReferencesUnavailable
      case 'page-busy': return t.pageEditBusy
      case 'preview-flush-unavailable': return t.pageEditPreview
      case 'page-context-changed': return t.pageEditChanged
      case 'save-timeout': return t.pageEditFlushTimeout
      case 'source-draft': return t.pageEditSourceDraft
      case 'source-refresh': return t.pageEditRefresh
      case 'page-draft':
      case 'source-conflict':
      case 'narration-conflict':
      case 'revision-conflict': return t.pageEditDraft
      case 'save-locked': return t.saveLocked
      default: return t.pageEditRequestFailed
    }
  }

  pageEditCapability(section: string): { rename: boolean, move: boolean, reason?: string } {
    const exists = Boolean(this.#state.authoring?.content?.sections[section])
    const capability = { rename: exists, move: exists }
    if (isAgentChanging(this.#state)) return { rename: false, move: false, reason: this.#messages.saveLocked }
    if (this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isHistoryBusy) return { rename: false, move: false, reason: this.#messages.pageEditBusy }
    return capability
  }

  clearPageEditFailure(): void { this.#set({ pageEditFailure: undefined }) }

  /** The preview acknowledges that all registered lecture playback has paused before audition audio starts. */
  pausePlayback(): Promise<void> { return this.#playback.pause() }

  /** The owner must invalidate pending audio responses as well as stop its current audio element. */
  registerAudition(stop: () => void): () => void { return this.#playback.registerAudition(stop) }

  /** Inline runtimes join the same exclusive playback group as author auditions. */
  startDocumentPlayback(stop: () => Promise<void>): Promise<() => void> { return this.#playback.startDocumentPlayback(stop) }

  stopAuditions(): void { this.#playback.stopAuditions() }

  /** The latest source actor value, scoped to the field/editor that captured its identity. */
  getDocument(identity?: string): TeachingDocument | undefined {
    const source = this.#state.authoring
    if (!source || source.loading || source.directory !== this.#state.document || identity !== undefined && identity !== source.identity) return undefined
    return source.content
  }
  /** Uses the current actor revision so timing edits cannot replace later body or narration input. */
  setDocumentStepProduction(stepId: string, patch: StepTimingPatch, identity?: string): void {
    const document = this.getDocument(identity)
    if (!document || isAgentChanging(this.#state)) return
    const next = changeStepTiming(document, stepId, patch)
    if (next === document) return
    this.stopAuditions()
    this.#documentSession.record(next)
  }
  documentTimingDraft(stepId: string, key: StepDurationKey, identity: string, reset: number): StepDurationDraft | undefined {
    const document = this.getDocument(identity)
    return document && this.#state.authoring?.reset === reset ? this.#documentTimingDrafts.get(identity, document, stepId, key) : undefined
  }
  /** Retains unaccepted numeric input by stable target; it is not authoring content or a second timing source. */
  setDocumentTimingDraft(stepId: string, key: StepDurationKey, draft: StepDurationDraft | undefined, identity: string, reset: number): void {
    const source = this.#state.authoring, document = this.getDocument(identity)
    if (!document?.steps[stepId] || source?.reset !== reset || isAgentChanging(this.#state)) return
    if (!this.#documentTimingDrafts.set(identity, document, stepId, key, draft)) return
    this.#set({ authoring: { ...source }, hasDocumentTimingDrafts: this.#documentTimingDrafts.has(identity, document), documentTimingDraftStorageFailure: this.#documentTimingDrafts.failed })
  }
  /** Changes one stable narration target without replacing the body editor or derived captions. */
  setDocumentNarration(stepId: string, narrationId: string | undefined, content: NarrationNode[], identity?: string): string | undefined {
    const document = this.getDocument(identity)
    if (!document || isAgentChanging(this.#state) || !Object.hasOwn(document.steps, stepId)) return undefined
    const step = document.steps[stepId]!
    if (!document.sections[step.sectionId]?.stepOrder.includes(stepId)) return undefined
    if (!Array.isArray(content)) throw new Error('document-narration-content')
    let meaningful = false
    for (const node of content) {
      if (!node || typeof node !== 'object') throw new Error('document-narration-content')
      if (node.type === 'text' && typeof node.text === 'string') meaningful ||= Boolean(node.text.trim())
      else if (node.type === 'pronunciation' && typeof node.display === 'string' && typeof node.spoken === 'string') meaningful ||= Boolean(node.display.trim() || node.spoken.trim())
      else if (node.type === 'cue' && typeof node.id === 'string' && node.id && typeof node.action === 'string' && node.action) meaningful = true
      else throw new Error('document-narration-content')
    }
    const target = narrationId ?? step.narrationIds[0]
    const existing = target !== undefined && Object.hasOwn(document.narrations, target) ? document.narrations[target] : undefined
    if (existing && !step.narrationIds.includes(existing.id)) throw new Error('document-narration-target')
    if (!existing && !meaningful) return undefined
    const id = target ?? crypto.randomUUID()
    if (!id || id.length > 200 || /[\u0000-\u001f]/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('document-narration-target')
    if (!existing && (document.id === id || [document.sections, document.blocks, document.steps, document.assets, document.definitions].some(map => Object.hasOwn(map, id)))) throw new Error('document-narration-target')
    if (existing && JSON.stringify(existing.content) === JSON.stringify(content)) return id
    const next: TeachingDocument = { ...document,
      narrations: { ...document.narrations, [id]: { ...existing, id, content: structuredClone(content) } },
      ...step.narrationIds.includes(id) ? {} : { steps: { ...document.steps, [stepId]: { ...step, narrationIds: [...step.narrationIds, id] } } },
    }
    const cueIds = new Set(content.flatMap(node => node.type === 'cue' ? [node.id] : []))
    const previousCues = new Set(existing?.content.flatMap(node => node.type === 'cue' ? [node.id] : []) ?? [])
    if (document.production.cueTimings) {
      const removed = [...previousCues].filter(cue => !cueIds.has(cue) && Object.hasOwn(document.production.cueTimings!, cue)
        && !Object.values(next.narrations).some(narration => narration.content.some(node => node.type === 'cue' && node.id === cue)))
      if (removed.length) {
        const cueTimings = { ...document.production.cueTimings }
        for (const cue of removed) {
          this.#removedCueTimings.delete(cue)
          this.#removedCueTimings.set(cue, { ...cueTimings[cue]! })
          delete cueTimings[cue]
        }
        while (this.#removedCueTimings.size > 512) this.#removedCueTimings.delete(this.#removedCueTimings.keys().next().value!)
        next.production = { ...document.production, cueTimings }
      }
    }
    for (const cue of cueIds) {
      const timing = this.#removedCueTimings.get(cue)
      if (!previousCues.has(cue) && timing && !Object.hasOwn(next.production.cueTimings ?? {}, cue)) {
        next.production = { ...next.production, cueTimings: { ...next.production.cueTimings, [cue]: { ...timing } } }
        this.#removedCueTimings.delete(cue)
      }
    }
    this.stopAuditions()
    this.#documentSession.record(next)
    return id
  }
  recordDocument(content: TeachingDocument): void { if (!isAgentChanging(this.#state)) this.#documentSession.record(content) }
  documentComposition(composing: boolean, owner = 'body', identity?: string): void { this.#documentSession.composition(composing, owner, identity) }
  retryDocument(): Promise<void> { return this.#documentSession.retry() }
  discardDocument(): Promise<void> { return this.#documentSession.discard() }
  documentError(error: Error): void { this.#set({ save: { kind: 'failed', message: error.message } }) }
  documentInteraction(): void { this.#documentSelectionGeneration++ }
  pendingDocumentField(blockId: string, identity?: string): Pick<DocumentFieldRegistration, 'stepId' | 'narrationId' | 'slot'> | undefined {
    const pending = this.#pendingDocumentField, source = this.#state.authoring
    return pending && pending.generation === this.#documentSelectionGeneration && pending.field.blockId === blockId
      && pending.field.identity === (identity ?? source?.identity) && pending.reset === source?.reset ? pending.field : undefined
  }
  registerDocumentField(field: DocumentFieldRegistration): () => void {
    if (field.identity !== this.#state.authoring?.identity || field.reset !== this.#state.authoring.reset) return () => {}
    const key = JSON.stringify([field.identity, field.blockId, field.stepId, field.slot, field.narrationId])
    this.#documentFields.set(key, field)
    const pending = this.#pendingDocumentField
    if (pending && pending.reset === field.reset && JSON.stringify([pending.field.identity, pending.field.blockId, pending.field.stepId, pending.field.slot, pending.field.narrationId]) === key) {
      this.#pendingDocumentField = undefined
      if (pending.generation === this.#documentSelectionGeneration && field.identity === this.#state.authoring?.identity && field.reset === this.#state.authoring.reset) field.focus.restore(pending.bookmark)
    }
    return () => { if (this.#documentFields.get(key) === field) this.#documentFields.delete(key) }
  }
  attachDocumentEditor(editor: NativeDocumentEditor | undefined): void {
    if (editor !== this.#documentEditor) this.#documentSession.composition(false, 'body')
    this.#unsubscribeEditor?.(); this.#unsubscribeDocumentSelection?.(); this.#documentEditor = editor
    if (editor) {
      const focus = this.#pendingDocumentFocus, selection = this.#pendingDocumentSelection
      this.#pendingDocumentFocus = undefined; this.#pendingDocumentSelection = undefined
      if (focus && focus.documentId === this.#state.authoring?.content?.id && focus.generation === this.#documentSelectionGeneration && editor.getBlock(focus.nodeId)) {
        editor.setTextCursorPosition(focus.nodeId, 'start'); editor.focus()
      } else if (!this.#pendingDocumentField && selection && selection.documentId === this.#state.authoring?.content?.id) {
        const anchor = nativeTextPosition(editor, selection.anchor), head = nativeTextPosition(editor, selection.head)
        if (anchor !== undefined && head !== undefined) {
          editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, anchor, head)))
          if (selection.focused) editor.focus()
        }
      }
    }
    const update = () => this.#set({ editorHistory: editor ? { section: this.#state.position?.section ?? '', undo: undoDepth(editor.prosemirrorState) > 0, redo: redoDepth(editor.prosemirrorState) > 0 } : undefined })
    this.#unsubscribeEditor = editor?.onChange(update); update()
    this.#unsubscribeDocumentSelection = editor?.onSelectionChange(() => { this.#documentSelectionGeneration++ })
  }
  async flushPendingEdits(): Promise<void> {
    if (isAgentChanging(this.#state)) throw new Error('save-locked')
    await this.#documentSession.flush()
  }
  async #changeDocumentPage(change: (document: TeachingDocument) => void): Promise<boolean> {
    const source = this.#state.authoring, directory = this.#state.document
    if (!source?.content || directory === undefined || isAgentChanging(this.#state)) return false
    this.#set({ isEditingPage: true, pageEditFailure: undefined })
    try {
      await this.flushPendingEdits()
      if (directory !== this.#state.document) return false
      const document = structuredClone(this.#state.authoring!.content!)
      change(document)
      const editor = this.#documentEditor
      this.#pendingDocumentField = undefined
      const plannedFocus = this.#pendingDocumentFocus
      if (!plannedFocus || plannedFocus.generation !== this.#documentSelectionGeneration) for (const field of this.#documentFields.values()) {
        if (field.identity !== source.identity || field.reset !== this.#state.authoring!.reset || !document.blocks[field.blockId] || !document.steps[field.stepId]) continue
        const bookmark = field.focus.capture()
        if (bookmark) {
          const { focus: _focus, ...target } = field
          this.#pendingDocumentField = { field: target, bookmark, reset: this.#state.authoring!.reset + 1, generation: this.#documentSelectionGeneration }
          this.#pendingDocumentSelection = undefined
          break
        }
      }
      if (editor && !this.#pendingDocumentField) {
        const state = editor.prosemirrorState, anchor = nativeTextPoint(editor, state.selection.anchor), head = nativeTextPoint(editor, state.selection.head)
        if (anchor && head) this.#pendingDocumentSelection = { documentId: document.id, anchor, head, focused: editor.prosemirrorView.hasFocus() }
      }
      this.#documentSession.replace(document)
      await this.#documentSession.flush()
      return true
    } catch (error) { if (directory === this.#state.document) this.#set({ pageEditFailure: this.#pageEditMessage(errorMessage(error)) }); return false }
    finally { if (directory === this.#state.document) this.#set({ isEditingPage: false }) }
  }
  renamePage(section: string, title: string): Promise<boolean> {
    return this.#changeDocumentPage(document => { if (!document.sections[section]) throw new Error('page-boundary'); document.sections[section]!.title = title.trim() })
  }
  movePage(section: string, before: string | null): Promise<boolean> {
    return this.#changeDocumentPage(document => {
      if (!document.sections[section] || before !== null && !document.sections[before]) throw new Error('page-boundary')
      if (before === section) return
      document.sectionOrder = document.sectionOrder.filter(id => id !== section)
      document.sectionOrder.splice(before === null ? document.sectionOrder.length : document.sectionOrder.indexOf(before), 0, section)
    })
  }
  pageDeleteMessage(reason: string): string { return this.#pageEditMessage(reason) }
  async preparePageDeletion(section: string): Promise<PageDeletePlan> {
    await this.flushPendingEdits()
    const source = this.#state.authoring
    if (!source?.content || !source.version || this.#state.document === undefined) throw new Error('document-unavailable')
    return pageDeletion(source.content, this.#state.document, source.version, section)
  }
  async deletePage(plan: PageDeletePlan): Promise<boolean> {
    if (!plan.allowed || plan.document !== this.#state.document) return false
    return this.#changeDocumentPage(document => {
      if (this.#state.authoring?.version !== plan.source.version) throw new Error('revision-conflict')
      const current = pageDeletion(document, plan.document, plan.source.version, plan.section)
      if (!current.allowed) throw new Error(current.reason)
      Object.assign(document, removeDocumentPage(document, plan.section))
      this.#set({ position: { section: document.sectionOrder[0]!, step: 0, trail: [], view: 'document' }, documentNavigation: { section: document.sectionOrder[0]!, request: crypto.randomUUID() } })
    })
  }
  createPage(after = this.#state.position?.section): void {
    if (this.#state.isEditingPage || this.#state.isCreatingPage) return
    const id = crypto.randomUUID(), stepId = crypto.randomUUID(), blockId = crypto.randomUUID(), nodeId = crypto.randomUUID()
    const generation = this.#documentSelectionGeneration
    void this.#changeDocumentPage(document => {
      document.sections[id] = { id, title: this.#messages.newPage, children: [blockId], stepOrder: [stepId], layout: { type: 'stack' } }
      document.blocks[blockId] = { id: blockId, type: 'text', content: [{ id: nodeId, type: 'paragraph', children: [] }] }
      document.steps[stepId] = { id: stepId, sectionId: id, visuals: [{ blockId, visible: true }], narrationIds: [] }
      const index = after ? document.sectionOrder.indexOf(after) : document.sectionOrder.length - 1
      document.sectionOrder.splice(index + 1, 0, id)
      if (generation === this.#documentSelectionGeneration) {
        this.#pendingDocumentFocus = { documentId: document.id, nodeId, generation }
        this.#set({ position: { section: id, step: 0, trail: [], view: 'document' }, documentNavigation: { section: id, request: crypto.randomUUID() } })
      }
    })
  }

  /** Points at a block or a passage (none: stops pointing): the preview outlines it and the conversation is told. */
  point(pointer: Pointer | undefined): void {
    const pointed = this.#state.pointer !== undefined || this.#state.focus.length > 0
    if (pointer) this.#record('point', { 'presmium.section': pointer.target.section, 'presmium.block': pointer.target.block, 'presmium.step': pointer.step, 'presmium.quote': pointer.quote, 'presmium.editable': pointer.isEditable })
    this.#set({ pointer, askFailure: undefined })
    this.#broadcast({ type: 'highlight', target: pointer?.target ?? null })
    if (pointer) this.setFocus([this.#focusReportOf(pointer)])
    else if (pointed) this.setFocus([])
  }

  #focusReportOf(pointer: Pointer): FocusReport {
    const { target, step, quote } = pointer
    return { id: 'selection', from: this.#state.previewRenderer, section: target.section, ...target.block ? { block: target.block } : {}, ...step === undefined ? {} : { step }, ...quote ? { quote: quote.slice(0, 2000) } : {} }
  }

  setFocus(focus: FocusReport[]): void {
    const document = this.#state.document
    if (document === undefined) return
    const version = ++this.#focusVersion
    this.#set({ focus, isFocusPending: true, focusFailure: undefined })
    this.#focusWriting = this.#focusWriting.then(async () => {
      if (version !== this.#focusVersion) return
      try {
        const answer = await this.client.writeFocus(document, focus)
        if (version === this.#focusVersion && document === this.#state.document) this.#set({ focus: answer.focus ?? [], isFocusPending: false })
      } catch (error) {
        if (version === this.#focusVersion && document === this.#state.document) this.#set({ isFocusPending: false, focusFailure: errorMessage(error) })
      }
    })
  }

  /** Hands `instruction` about what the author points at (or `focus`) to the conversation's agent. */
  askAgent(instruction: string, focus: FocusReport[] = this.#state.pointer ? [this.#focusReportOf(this.#state.pointer)] : []): Promise<boolean> {
    return this.#ask('request', focus, places => this.#messages.agentRequest(instruction, [...places.values()]))
  }

  /**
   * Sets `focus` as the document's focus, then sends the agent the message `compose` writes from the places, by focus id.
   * The message names places as the author sees them; the agent's document context has their source ranges.
   */
  async #ask(kind: 'request' | 'comments', focus: FocusReport[], compose: (places: Map<string, AgentPlace>) => string): Promise<boolean> {
    const document = this.#state.document
    const asker = [...this.#askers][0]
    const t = this.#messages
    if (document === undefined) return false
    // The request's id joins the operation to the conversation: the session's user message carries it, and its turn follows.
    const asked = (attributes: Record<string, OperationValue>) => this.#record('agent.ask', { 'presmium.ask.kind': kind, 'presmium.focus': focus.map(item => [item.id, item.section, item.block].filter(Boolean).join(':')).join('\n'), ...attributes })
    if (!asker) {
      asked({ 'presmium.outcome': 'no-conversation' })
      this.#set({ askFailure: t.noConversation })
      return false
    }
    this.#set({ isAsking: true, askFailure: undefined })
    let text: string | undefined
    try {
      if (focus.length > 0) {
        this.setFocus(focus)
        await this.#focusWriting
      }
      const located = this.#state.focus as (FocusReport & Partial<Focus>)[]
      const places = new Map(located.map(item => [item.id, this.#describe(item)]))
      text = compose(places)
      const answer = await asker({ text, focus })
      asked({ 'presmium.ask.text': text, 'presmium.outcome': 'sent', 'dsh.session.id': answer?.session, 'dsh.request.id': answer?.request })
      if (this.#state.document === document) this.#set({ isAsking: false, pointer: undefined })
      this.#broadcast({ type: 'highlight', target: null })
      return true
    } catch (error) {
      asked({ 'presmium.ask.text': text, 'presmium.outcome': 'failed', 'presmium.error': errorMessage(error) })
      if (this.#state.document === document) this.#set({ isAsking: false, askFailure: errorMessage(error) })
      return false
    }
  }

  /** A place as the author sees it: the section's title and the passage. */
  #describe(item: FocusReport & Partial<Focus>): AgentPlace {
    const doc = this.#state.ir?.doc
    const section = item.section ? doc?.sections.find(s => s.id === item.section)?.title ?? item.section : undefined
    const quote = item.quote ?? item.excerpt
    return { ...section ? { section } : {}, ...quote ? { quote: quote.slice(0, 1500) } : {} }
  }

  /** Shows a section, or a block of it, in the preview (the next one attached, when none is). */
  revealPlace(section: string, block?: string): void {
    this.#record('reveal.place', { 'presmium.section': section, 'presmium.block': block })
    const target: PreviewAnchor = { section, ...block ? { block } : {} }
    if (this.#previewSinks.size === 0) {
      this.#pendingReveal = target
      return
    }
    this.#broadcast({ type: 'go', section })
    this.#broadcast({ type: 'highlight', target })
  }

  /** Shows a section in the preview: from the navigation pane, the section to read or the slide to show. */
  goToSection(section: string): void {
    if (this.#state.webView === 'document' && this.#state.authoring?.content?.sections[section]) {
      this.#set({ position: { section, step: 0, trail: [], view: 'document' }, documentNavigation: { section, request: crypto.randomUUID() } }); return
    }
    this.goToStep(section, this.#selectedSteps.get(`${this.#state.document}\0${section}`) ?? 0)
  }

  observeDocumentSection(section: string): void {
    if (this.#state.webView !== 'document' || !this.#state.authoring?.content?.sections[section] || this.#state.position?.section === section) return
    this.#set({ position: { section, step: this.#selectedSteps.get(`${this.#state.document}\0${section}`) ?? 0, trail: [], view: 'document' } })
  }

  /** A read-only inline runtime chooses a source step without navigating or editing the document. */
  observeDocumentStep(sectionId: string, stepId: string): void {
    this.#documentStep(sectionId, stepId, false)
  }

  /** An author freezes this target even when its step has not changed. */
  pauseDocumentStep(sectionId: string, stepId: string): void {
    this.#documentStep(sectionId, stepId, true)
  }

  #documentStep(sectionId: string, stepId: string, pause: boolean): void {
    const content = this.#state.authoring?.content, section = content?.sections[sectionId]
    if (this.#state.webView !== 'document' || !content?.sectionOrder.includes(sectionId) || !section) return
    const step = section.stepOrder.indexOf(stepId)
    if (step < 0 || content.steps[stepId]?.sectionId !== sectionId) return
    this.#selectedSteps.set(`${this.#state.document}\0${sectionId}`, step)
    const same = this.#state.position?.section === sectionId && this.#state.position.step === step
    if (same && !pause) return
    this.#set({ position: { section: sectionId, step, trail: section.stepOrder.slice(1, step + 1).map(id => `step:${id}`), view: 'document' }, documentPositionIntent: same && pause ? 'pause' : 'seek' })
  }

  /** Complete-IR position; trail maps the same step into a filtered preview without reusing its ordinal. */
  goToStep(section: string, step: number): void {
    const target = this.#state.ir?.doc.sections.find(item => item.id === section)
    if (!target || !Number.isInteger(step) || step < 0 || step > target.steps) return
    const trail = stepTrail(stepKeys(target), step)
    this.#set({ position: { section, step, trail, view: this.#state.webView } })
    this.#record('navigate', { 'presmium.section': section, 'presmium.step': step })
    this.#selectedSteps.set(`${this.#state.document}\0${section}`, step)
    this.#lastPosition = undefined
    const command = { type: 'go', section, step, trail, view: this.#state.webView } as const
    if (this.#previewSinks.size === 0) {
      this.#pendingGo = { document: this.#state.document, command }
      return
    }
    this.#broadcast(command)
  }

  /** Shows the place of a line of a source file: in the document holding the file, opened when it is another. */
  async revealSource(path: string, line = 1): Promise<boolean> {
    this.#record('reveal.source', { 'presmium.path': path, 'presmium.line': line })
    const documents = this.#state.documents?.documents ?? []
    const holder = [...documents].sort((a, b) => b.dir.length - a.dir.length).find(doc => !doc.dir || path.startsWith(`${doc.dir}/`))
    if (!holder) return false
    if (holder.dir !== this.#state.document) await this.openDocument(holder.dir)
    const doc = this.#state.ir?.doc
    const place = doc && findPlaceAtLine(doc, path, line)
    if (!place) return false
    this.revealPlace(place.section, place.block)
    return true
  }

  undo(): Promise<boolean> { if (this.#state.mode !== 'editing') return Promise.resolve(false); if (this.#documentEditor && this.#state.editorHistory?.undo) return Promise.resolve(this.#documentEditor.undo()); return this.#changeHistory('undo') }
  redo(): Promise<boolean> { if (this.#state.mode !== 'editing') return Promise.resolve(false); if (this.#documentEditor && this.#state.editorHistory?.redo) return Promise.resolve(this.#documentEditor.redo()); return this.#changeHistory('redo') }

  async #changeHistory(action: 'undo' | 'redo' | 'revert', revision?: string): Promise<boolean> {
    if (this.#state.mode !== 'editing' || this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isHistoryBusy || this.#state.isHistoryPreparing) return false
    const document = this.#state.document, scope = this.#documentScope
    if (document === undefined) return false
    const current = () => this.#state.document === document && this.#documentScope === scope
    this.#set({ isHistoryPreparing: true, historyFailure: undefined })
    try {
      if (!current()) return false
        await this.flushPendingEdits()
      if (!current()) return false
      await this.#history.read(document)
      if (!current()) return false
      const done = await this.#timed(`history.${action}`, revision ? { 'presmium.revision': revision } : {}, () => action === 'revert' ? this.#history.revert(revision!) : this.#history[action](), done => done ? 'done' : 'refused')
      if (done && current()) await this.#documentSession.refresh(document)
      return done
    } catch {
      if (current()) this.#set({ historyFailure: this.#messages.historyPendingSave })
      return false
    } finally { if (current()) this.#set({ isHistoryPreparing: false }) }
  }

  revertRevision(id: string): Promise<boolean> {
    return this.#changeHistory('revert', id)
  }

  acceptReview(): Promise<boolean> {
    return this.#timed('review.accept', {}, () => this.#history.acceptReview(), done => (done ? 'done' : 'refused'))
  }

  rejectReview(): Promise<boolean> {
    return this.#timed('review.reject', {}, () => this.#history.rejectReview(), done => (done ? 'done' : 'refused'))
  }

  /** Makes the document into `target` (a renderer, or an export of its plugins) as a job of the workspace server. */
  startJob(target: string): Promise<void> {
    return this.#timed('job.start', { 'presmium.job.target': target }, async () => { const stop = this.observeJobs(); try { await this.#jobs.start(target) } finally { stop() } })
  }

  cancelJob(id: string): Promise<void> {
    return this.#timed('job.cancel', { 'presmium.job.id': id }, async () => { const stop = this.observeJobs(); try { await this.#jobs.cancel(id) } finally { stop() } })
  }

  recordOutsideChanges(): Promise<boolean> {
    return this.#timed('changes.record', {}, () => this.#history.recordOutside(this.#messages.outsideChange), done => (done ? 'done' : 'refused'))
  }

  /** Attaches the shown preview and selects the requested view in its existing runtime. */
  attachPreview(sink: PreviewSink): () => void {
    this.#previewSinks.add(sink)
    if (this.#state.previewRenderer === 'web') this.#showWebView([sink])
    const pending = this.#pendingGo
    if (pending && pending.document === this.#state.document) sink.send(pending.command)
    this.#pendingGo = undefined
    sink.send({ type: 'appearance', dark: this.#state.isDark })
    sink.send({ type: 'pick', on: false })
    const reveal = this.#pendingReveal
    this.#pendingReveal = undefined
    if (reveal) sink.send({ type: 'go', section: reveal.section })
    sink.send({ type: 'highlight', target: reveal ?? this.#state.pointer?.target ?? null })
    return () => {
      this.#previewSinks.delete(sink)
      this.#playback.detach(sink)
    }
  }

  /** A report of the shown preview. */
  handlePreviewReport(document: string, renderer: PreviewRenderer, report: PreviewReport, origin?: PreviewSink): void {
    const unsupported = 'document-authoring-required'
    if (report.type === 'edited' && report.request !== undefined) { origin?.send({ type: 'edit-result', request: report.request, target: report.target, error: unsupported }); return }
    if (report.type === 'blocks-edited') { origin?.send({ type: 'blocks-result', section: report.section, request: report.request, error: unsupported }); return }
    if (report.type === 'source-read') { origin?.send({ type: 'source-result', section: report.section, block: report.block, request: report.request, error: unsupported }); return }
    if (report.type === 'source-save') { origin?.send({ type: 'source-saved', section: report.section, block: report.block, request: report.request, error: unsupported }); return }
    if (report.type === 'source-create') { origin?.send({ type: 'source-created', section: report.section, request: report.request, error: unsupported }); return }
    if (report.type === 'page-create') { origin?.send({ type: 'page-created', section: report.section, request: report.request, error: unsupported }); return }
    if (document !== this.#state.document || renderer !== this.#state.previewRenderer) return
    this.#playback.report(document, report, origin)
    switch (report.type) {
      case 'ready':
      case 'updated':
        if (report.revision !== this.#state.previewIrRevision) this.#playback.stopAuditions()
        this.#set({ previewIrRevision: report.revision })
        this.#flashChanges()
        if (report.type === 'ready' && renderer === 'web' && this.#state.webView !== 'document') this.#showWebView()
        break
      case 'picked': {
        if (this.#state.mode !== 'editing') break
        const target: PreviewAnchor = { section: report.section, ...report.block ? { block: report.block } : {} }
        const isEditable = false
        const section = this.#state.ir?.doc.sections.find(s => s.id === report.section)
        const step = section && report.trail ? trailStep(stepKeys(section), report.trail) : report.step
        this.point({ target, ...step === undefined ? {} : { step }, ...report.rect ? { rect: report.rect } : {}, ...report.point ? { point: report.point } : {}, isEditable })
        break
      }
      case 'selection': {
        if (this.#state.mode !== 'editing') break
        const selected = report.selection
        if (selected?.text.trim()) {
          const target: PreviewAnchor = { section: selected.section, ...selected.block ? { block: selected.block } : {} }
          this.point({ target, quote: selected.text.trim(), ...selected.rect ? { rect: selected.rect } : {}, ...selected.obstacles ? { obstacles: selected.obstacles } : {}, isEditable: false })
        } else if (this.#state.pointer?.quote) this.point(undefined)
        break
      }
      case 'rect':
        if (this.#state.pointer) this.#set({ pointer: { ...this.#state.pointer, rect: report.rect ?? undefined, obstacles: report.obstacles } })
        break
      case 'position': {
        // A fresh frame announces its document view before applying the queued
        // presentation command. Only the requested view completes that switch.
        if (renderer === 'web' && this.#awaitingView) {
          if (report.view !== this.#awaitingView) break
          this.#awaitingView = undefined
        }
        // Where the author reads or presents: recorded when it moves to another section, step or view.
        const at = `${report.section}\0${report.step}\0${report.view ?? ''}`
        if (at === this.#lastPosition) break
        this.#lastPosition = at
        const section = this.#state.ir?.doc.sections.find(section => section.id === report.section)
        const completeStep = section && report.trail.length ? trailStep(stepKeys(section), report.trail) : report.step
        this.#selectedSteps.set(`${this.#state.document}\0${report.section}`, completeStep)
        this.#set({ position: { section: report.section, step: completeStep, trail: report.trail, ...report.view ? { view: report.view } : {} } })
        if (renderer === 'web' && report.view && (report.view === 'present') !== (this.#state.webView === 'present')) this.setWebView(report.view === 'present' ? 'present' : 'document')
        this.#record('preview.position', { 'presmium.section': report.section, 'presmium.step': report.step, 'presmium.preview.view': report.view })
        break
      }
      case 'shortcut':
        this.#record('shortcut', { 'presmium.command': report.command })
        if (report.command === 'dismiss') {
          if (this.#state.pointer) this.point(undefined)
        } else if (report.command === 'undo') void this.undo()
        else void this.redo()
        break
      default:
        break
    }
  }

  #broadcast(command: PreviewCommand): void {
    for (const sink of this.#previewSinks) sink.send(command)
  }

  #stopSubscriptions(): void {
    this.#removedCueTimings.clear(); this.#cueTimingScope = undefined
    this.#documentSession.close()
    this.#unsubscribeEditor?.(); this.#unsubscribeEditor = undefined; this.#documentEditor = undefined
    this.#unsubscribeDocumentSelection?.(); this.#unsubscribeDocumentSelection = undefined
    this.#pendingDocumentFocus = undefined; this.#pendingDocumentSelection = undefined; this.#documentSelectionGeneration++
    this.#documentFields.clear(); this.#pendingDocumentField = undefined
    this.#playback.reset()
    this.#focusVersion++
    this.#pendingReveal = undefined
    this.#awaitingView = undefined
    this.#pendingFlash = undefined
    this.#unsubscribeIr?.()
    this.#unsubscribeIr = undefined
    this.#runtimeDocument = undefined
    this.#jobObservers.clear()
    this.#jobsDocument = undefined
    this.#history.stop()
    this.#diagnostics.stop()
    this.#jobs.stop()
  }

  dispose(): void {
    this.telemetry.stop()
    this.#stopSubscriptions()
    this.#diagnostics.dispose()
    this.#documentSession.dispose()
  }
}
