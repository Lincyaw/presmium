import { errorMessage, fnv1a64, irBlocks, previewEditBinding, slideShape, stepKeys, stepTrail, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, Focus, FocusReport, IrAnswer, IrEvent, IRDocument, JobsAnswer, OperationAnswer, PreviewAnchor, PreviewAnswer, PreviewCommand, PreviewDiagnostics, PreviewPin, PreviewPoint, PreviewPosition, PreviewRect, PreviewRenderer, PreviewReport, ReviewChange, ReviewSnapshot, RevisionsAnswer, UncommittedFile } from '@lincyaw/kernel'
import { CommentStore, newComment } from './comments.ts'
import type { DocumentComment } from './comments.ts'
import { DocumentDiagnostics } from './diagnostics.ts'
import { DocumentHistory } from './history.ts'
import { DocumentJobs } from './jobs.ts'
import { localeOf, MESSAGES } from './messages.ts'
import type { AgentPlace, Locale } from './messages.ts'
import { changedPlaces, findPlaceAtLine, findPlaceSource } from './places.ts'
import { OperationLog } from './telemetry.ts'
import type { OperationValue } from './telemetry.ts'
import { applyRenderedEdit } from './text-edit.ts'
import { narrationIrAfter, narrationTargetSignature, readStepNarration, writeStepNarration } from './narration.ts'
import type { StepNarrationDraft } from './narration.ts'
import { narrationDrafts } from './narration-drafts.ts'
import { bodyBlocks, writeBodyBlocks } from './block-edit.ts'
import { BodyBindings } from './body-bindings.ts'
import { movePageSource, pageEditCapability, pinPageSource, renamePageSource, writePage } from './page-edit.ts'
import { waitForSourceRevision } from './source-revision.ts'
import { PreviewPlayback } from './preview-playback.ts'
import { PreviewHistory } from './preview-history.ts'
import type { EditorHistoryState } from './preview-history.ts'
import { blockSourceTarget, previewBlockSource, readBlockSource, savedBlockSource, writeBlockSource } from './block-source.ts'
import type { BlockSourceDraft } from './block-source.ts'
import { workspaceClient, WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import type { VoiceoverRequest, VoiceoverSnapshot, VoiceSettingsChange, VoiceSettingsUpdate } from '@lincyaw/kernel'
import type { PageDeletePlan } from '@lincyaw/kernel'
import { DocumentVoiceover } from './voiceover.ts'

/** `editing`: blocks are picked, commented on and edited in place; `viewing`: the document reads as its readers see it. */
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

/** An edit in place that could not be written back as plain text, offered to the AI. */
export interface EditFallback {
  target: PreviewAnchor
  before: string
  after: string
}

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
  narration?: { section: string, step: number }
  narrationDirty?: boolean
  sourceDirty?: boolean
  bodyDirty?: boolean
  nativeDirty?: boolean
  isCreatingPage?: boolean
  isEditingPage?: boolean
  isEditingVoice?: boolean
  editorHistory?: EditorHistoryState
  isHistoryPreparing?: boolean
  voiceover?: VoiceoverSnapshot
  voiceoverFailure?: string
  voiceoverStarting?: boolean
  voiceoverCancelPending?: string
  pageEditFailure?: string
  diagnostics?: DiagnosticSnapshot
  isDiagnosticsUnavailable: boolean
  canRepairDiagnostics: boolean
  isRepairingDiagnostics: boolean
  diagnosticsRepairFailure?: string
  pointer?: Pointer
  /** The block whose text is being edited in place. */
  editing?: PreviewAnchor
  save: SaveState
  editFallback?: EditFallback
  /** What the conversation's agent is told the author points at. */
  focus: FocusReport[]
  isFocusPending: boolean
  focusFailure?: string
  comments: DocumentComment[]
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

type Listener = () => void

/** The workbench's state as its parts read and change it. */
export interface WorkbenchStore {
  readonly state: WorkbenchState
  set(patch: Partial<WorkbenchState>): void
}

// The export of the lecture as a video (`@lincyaw/addon-lecture`).
export const VIDEO_TARGET = 'video'

/** The workspace's own routes: source paths are relative to the workspace root. */
const WORKSPACE_SCOPE = ''

// Blocks of these Markdown kinds are edited in place; others (code, components, math) through the AI.
const EDITABLE = new Set(['paragraph', 'heading', 'list', 'blockquote', 'table'])

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

// How long the author stays on a document's web form before its slides are started ahead of a switch.
// The document opened last, prepared when the workbench starts on the documents; at the latest this long after.
const RECENT_KEY = 'presmium.workbench.recent'
const PREWARM_IDLE_MS = 2000

/** The numbers on the blocks of the comments not yet sent, in order. */
function commentPins(comments: readonly DocumentComment[]): PreviewPin[] {
  return comments.filter(comment => comment.status === 'open' && comment.block).map((comment, i) => ({ id: comment.id, section: comment.section, block: comment.block!, label: String(i + 1) }))
}

/** What opening or closing a document clears. */
const DOCUMENT_RESET = {
  mode: 'editing',
  narration: undefined,
  narrationDirty: false,
  sourceDirty: false,
  bodyDirty: false,
  nativeDirty: false,
  isCreatingPage: false,
  isEditingPage: false,
  isEditingVoice: false,
  editorHistory: undefined,
  isHistoryPreparing: false,
  voiceover: undefined,
  voiceoverFailure: undefined,
  voiceoverStarting: false,
  voiceoverCancelPending: undefined,
  pageEditFailure: undefined,
  ir: undefined, preview: undefined, previewFailure: undefined, previewIrRevision: undefined, position: undefined,
  diagnostics: undefined, isDiagnosticsUnavailable: false, isRepairingDiagnostics: false, diagnosticsRepairFailure: undefined,
  pointer: undefined, editing: undefined, save: { kind: 'idle' }, editFallback: undefined,
  focus: [], isFocusPending: false, focusFailure: undefined, comments: [],
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

/** The front matter of `source` with its `title` set to `title`. */
export function withTitle(source: string, title: string): string {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  source = source.slice(bom.length)
  const line = `title: ${JSON.stringify(title)}`
  const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!head) return `${bom}---\n${line}\n---\n\n${source}`
  const body = /^title:.*$/m.test(head[1]!) ? head[1]!.replace(/^title:.*$/m, line) : `${line}\n${head[1]}`
  return `${bom}---\n${body}\n---\n${source.slice(head[0].length)}`
}

/**
 * The state of the workbench and its actions: the documents, the open document's preview, what the author points at
 * in it, its edits in place and its comments; its diagnostics and its history are parts of their own
 * (`diagnostics.ts`, `history.ts`).
 */
export class Workbench {
  readonly #bodyBindings = new BodyBindings()
  readonly #nativeReceipts = new Map<string, { path: string, version: string, revision: string, binding: string }>()
  readonly client: WorkspaceClient
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #selectedSteps = new Map<string, number>()
  #pendingGo?: { document: string | undefined, command: Extract<PreviewCommand, { type: 'go' }> }
  readonly #diagnostics: DocumentDiagnostics
  readonly #history: DocumentHistory
  readonly #jobs: DocumentJobs
  readonly #voiceover: DocumentVoiceover
  #voiceoverDocument?: string
  readonly #comments = new CommentStore()
  readonly #askers = new Set<(request: AgentRequest) => Promise<AgentAnswer | void>>()
  readonly #previewSinks = new Set<PreviewSink>()
  #unsubscribeIr?: () => void
  #previewReads = 0
  #irReads = 0
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #edits: Promise<void> = Promise.resolve()
  #narrationScope = 0
  #unsubscribeNarrationDrafts?: () => void
  readonly #blockSources = new Map<string, BlockSourceDraft>()
  #pageRequest?: { document: string, section: string, id: string, request: number, timer: ReturnType<typeof setTimeout> }
  #pageSequence = Date.now()
  readonly #flushRequests = new Map<number, { document: string, scope: number, sink: PreviewSink, generation?: number, finish(error?: string): void }>()
  readonly #playback = new PreviewPlayback(() => ({ document: this.#state.document, scope: this.#narrationScope, sinks: this.#previewSinks }))
  readonly #bodyHistory = new PreviewHistory(() => ({ document: this.#state.document, scope: this.#narrationScope, sinks: this.#previewSinks }), editorHistory => this.#set({ editorHistory }))
  /** A place to show that no preview could take yet (none was attached, e.g. the chat covered the document). */
  #pendingReveal?: PreviewAnchor
  /** The AI's changes to show on the document once the preview has them. */
  #pendingFlash?: ReviewChange[]
  #lastPosition?: string
  /** The forms asked for ahead of the author (`web:<dir>`, `slides:<dir>`), and the wait before asking for the slides. */
  readonly #prefetched = new Set<string>()
  #prewarmed = false
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
      isDiagnosticsUnavailable: false,
      canRepairDiagnostics: false,
      isRepairingDiagnostics: false,
      save: { kind: 'idle' },
      focus: [],
      isFocusPending: false,
      comments: [],
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
    this.#diagnostics = new DocumentDiagnostics(this.client, store)
    this.#jobs = new DocumentJobs(this.client, store)
    this.#voiceover = new DocumentVoiceover(this.client, store, async (document, revision) => {
      if (this.#state.document !== document || this.#state.ir?.revision !== revision) return
      if (this.#state.webView === 'document') return
      await this.pausePlayback()
      if (this.#state.document === document && this.#state.ir?.revision === revision) this.reloadPreview()
    })
    this.#history = new DocumentHistory(this.client, store, (changes) => {
      this.#record('ai.change', { 'presmium.files': changes.map(change => change.path).join('\n'), 'presmium.added': changes.reduce((n, c) => n + c.added, 0), 'presmium.removed': changes.reduce((n, c) => n + c.removed, 0) })
      this.#pendingFlash = changes
      this.#flashChanges()
    })
    this.telemetry = new OperationLog(() => this.client.readTelemetry(), (batch, beacon) => this.client.sendTelemetry(batch, beacon), this.#state.locale)
    const drafts = narrationDrafts(this.client)
    this.#unsubscribeNarrationDrafts = drafts.subscribe(() => {
      this.markNarrationDirty(this.#state.document !== undefined && drafts.dirty(this.#state.document))
    })
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

  #set(patch: Partial<WorkbenchState>): void {
    this.#state = { ...this.#state, ...patch }
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
      this.#prewarmRecent()
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

  /** Changes the title in a document's front matter; the change is a revision of its own. */
  retitleDocument(dir: string, title: string): Promise<void> {
    return this.#timed('document.retitle', { 'presmium.op.dir': dir, 'presmium.title': title }, async () => {
      const { doc } = await this.client.readIr(dir)
      const entry = doc.meta.entry
      const source = await this.client.readSource(WORKSPACE_SCOPE, entry)
      await this.client.saveSource(WORKSPACE_SCOPE, entry, withTitle(source.content, title), source.version, this.#messages.retitled(title))
      await this.loadDocuments()
      if (this.#state.document === dir) void this.#history.read(dir)
    })
  }

  async openDocument(dir: string): Promise<void> {
    if (this.#state.document === dir) return
    this.#narrationScope++
    this.#blockSources.clear()
    this.#stopSubscriptions()
    this.#history.subscribeReview(dir)
    this.#set({ ...DOCUMENT_RESET, document: dir, previewRenderer: 'web', webView: 'document' })
    this.markNarrationDirty(narrationDrafts(this.client).dirty(dir))
    this.#record('document.open')
    try {
      localStorage.setItem(RECENT_KEY, dir)
    } catch {}
    this.#diagnostics.subscribe(dir)
    this.#jobs.subscribe(dir)
    this.#unsubscribeIr = this.client.subscribeIr(dir, event => void this.#handleIrEvent(dir, event), () => void this.#readIr(dir))
    void this.client.readWorkbenchInfo().then(({ root }) => {
      this.#comments.setRoot(root)
      if (this.#state.document === dir) this.#setComments(this.#comments.read(dir))
    }, () => {
      if (this.#state.document === dir) this.#setComments(this.#comments.read(dir))
    })
    await Promise.all([this.#readIr(dir), this.#readPreview(dir), this.#readFocus(dir), this.#history.read(dir)])
  }

  closeDocument(): void {
    this.#narrationScope++
    if (this.#state.document !== undefined) this.#record('document.close')
    this.#stopSubscriptions()
    this.#blockSources.clear()
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
        const changed = this.#state.ir?.revision !== ir.revision
        this.#set({ ir })
        this.#flashChanges()
        if (changed) void this.#voiceover.read()
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
    this.#bodyHistory.reset()
    if (this.#state.editing) this.#broadcast({ type: 'edit', target: null })
    this.#set({ mode })
    this.#record('mode.set')
    this.point(undefined)
    this.#broadcast({ type: 'pick', on: mode === 'editing' })
  }

  setPreviewRenderer(renderer: PreviewRenderer): void {
    if (renderer === this.#state.previewRenderer) return
    this.#set({ previewRenderer: renderer, preview: undefined, previewFailure: undefined, previewIrRevision: undefined, pointer: undefined })
    this.#record('view.set')
    const document = this.#state.document
    if (document !== undefined) void this.#readPreview(document)
  }

  /**
   * Shows the web form as a page or as its presentation. The page is the same (and stays loaded): the view changes there,
   * at the place the author is; from the slides, the web form is shown first.
   */
  setWebView(view: WebView): void {
    if (view === this.#state.webView && this.#state.previewRenderer === 'web') return
    this.#set({ webView: view })
    this.#record('view.set', { 'presmium.preview.view': view })
    if (this.#state.previewRenderer !== 'web') {
      this.setPreviewRenderer('web')
    } else this.#showWebView()
  }

  #showWebView(sinks: Iterable<PreviewSink> = this.#previewSinks): void {
    const selected = this.#state.narration ?? this.#state.position
    const section = selected?.section ?? this.#state.ir?.doc.sections[0]?.id
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

  /** Opens the narration editor at a document or animation step. */
  selectNarration(section: string, step: number, navigate = true): void {
    const target = this.#state.ir?.doc.sections.find(s => s.id === section)
    if (!target || !Number.isInteger(step) || step < 0 || step > target.steps) return
    this.point(undefined)
    this.#set({ narration: { section, step }, ...!navigate ? { position: { section, step, trail: [], view: this.#state.webView } } : {} })
    if (navigate) this.#broadcast({ type: 'go', section, step, ...(this.#state.webView === 'present' ? { view: 'present' } : {}) })
    this.#record('narration.select', { 'presmium.section': section, 'presmium.step': step })
  }

  closeNarration(): void {
    this.#set({ narration: undefined })
  }

  markNarrationDirty(dirty: boolean): void {
    if (this.#state.narrationDirty !== dirty) this.#set({ narrationDirty: dirty })
  }

  saveNarration(draft: StepNarrationDraft, text: string, mode: StepNarrationDraft['mode']): Promise<StepNarrationDraft> {
    const dir = this.#state.document
    const scope = this.#narrationScope
    const current = () => scope === this.#narrationScope && dir === this.#state.document
    const operation = this.#edits.then(async () => {
      if (isAgentChanging(this.#state)) throw new Error(this.#messages.saveLocked)
      const opened = this.#state.ir
      const document = opened?.doc
      const section = document?.sections.find(section => section.id === draft.section)
      if (!current() || dir === undefined || !document || document.meta.entry !== draft.document.meta.entry || !section) throw new Error('narration-conflict')
      this.#set({ save: { kind: 'saving' } })
      try {
        // Other steps may have saved meanwhile and moved source lines. Rebase only an unchanged target.
        const latest = await readStepNarration(this.client, document, section, draft.step)
        if (!current() || narrationTargetSignature(latest) !== narrationTargetSignature(draft)) throw new Error('narration-conflict')
        const content = writeStepNarration(latest, text, mode)
        if (content === latest.source.content) {
          this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
          return latest
        }
        const saved = await this.client.saveSource(WORKSPACE_SCOPE, latest.source.path, content, latest.source.version, this.#messages.editedNarration(draft.step + 1))
        const answer = await narrationIrAfter(this.client, dir, opened!.revision)
        const updated = answer.doc.sections.find(section => section.id === draft.section)
        if (!updated) throw new Error('narration-conflict')
        const confirmed = await readStepNarration(this.client, answer.doc, updated, draft.step)
        if (confirmed.source.version !== saved.version) throw new Error('narration-conflict')
        if (current()) {
          await this.#readIr(dir)
          await this.#history.read(dir)
          if (current()) this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
        }
        this.#record('narration.save', { 'presmium.section': draft.section, 'presmium.step': draft.step, 'presmium.mode': mode })
        return confirmed
      } catch (error) {
        const reason = error instanceof WorkspaceServerError && error.status === 409 ? 'narration-conflict' : errorMessage(error)
        const message = reason === 'narration-conflict' ? this.#messages.narrationChanged : reason === 'formatted-narration' ? this.#messages.narrationFormatted : reason === 'narration-refresh' ? this.#messages.narrationRefresh : reason
        if (current()) this.#set({ save: { kind: 'failed', message } })
        throw new Error(reason === 'narration-conflict' ? reason : message)
      }
    })
    this.#edits = operation.then(() => {}, () => {})
    return operation
  }

  async #saveBlocks(report: Extract<PreviewReport, { type: 'blocks-edited' }>, current: () => boolean, result: (error?: string, revision?: string) => void): Promise<void> {
    const dir = this.#state.document
    const answer = this.#state.ir
    const section = answer?.doc.sections.find(s => s.id === report.section)
    if (dir === undefined || !answer || !section) return result(this.#messages.blockUnknown)
    if (isAgentChanging(this.#state)) return result(this.#messages.saveLocked)
    if (report.revision !== answer.revision) return result(this.#messages.blockConflict)
    this.#set({ save: { kind: 'saving' } })
    try {
      const source = await this.client.readSource(WORKSPACE_SCOPE, section.source.file)
      if (!current()) return result('document-inactive')
      const content = writeBodyBlocks(answer.doc, section, source.content, report.blocks, this.#bodyBindings.read(source.path, source.version, section.id))
      // Refuse stale maps even if another save finished while the file was read.
      if (!current()) return result('document-inactive')
      if (this.#state.ir?.revision !== answer.revision) throw new Error(this.#messages.blockConflict)
      const changed = content !== source.content
      const saved = changed ? await this.client.saveSource(WORKSPACE_SCOPE, source.path, content, source.version, this.#messages.editedBody(section.title)) : { version: source.version }
      const compiled = changed ? await waitForSourceRevision(this.client, dir, answer.revision) : answer
      if (current()) await this.#readIr(dir)
      const revision = compiled.revision
      const confirmed = await this.client.readSource(WORKSPACE_SCOPE, source.path)
      if (confirmed.version !== saved.version) throw new Error(this.#messages.blockConflict)
      if (current()) {
        this.#bodyBindings.saved(source.path, source.version, saved.version, section.id, bodyBlocks(section, answer.doc), compiled.doc.sections.find(page => page.id === section.id))
        await this.#history.read(dir)
        if (current()) this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
      }
      this.#record('blocks.save', { 'presmium.document': dir, 'presmium.section': section.id, 'presmium.blocks': report.blocks.length })
      result(undefined, revision)
    } catch (error) {
      const reason = errorMessage(error)
      const message = reason === 'block-source-binding' ? this.#messages.blockSourceBinding : reason === 'block-step-order' ? this.#messages.blockStepOrder : reason === 'block-multiple-files' ? this.#messages.blockFiles : reason === 'block-mixed-container' ? this.#messages.blockContainer : this.#sourceError(error)
      if (current()) this.#set({ save: { kind: 'failed', message } })
      result(message)
    }
  }

  #sourceError(error: unknown): string {
    const reason = errorMessage(error)
    if (reason === 'source-unknown') return this.#messages.sourceUnknown
    if (error instanceof WorkspaceServerError && error.answer.ignored?.length) return this.#messages.sourceIgnored
    if (reason === 'source-changed' || error instanceof WorkspaceServerError && error.status === 409) return this.#messages.sourceChanged
    if (reason === 'source-large') return this.#messages.sourceLarge
    if (reason === 'source-refresh') return this.#messages.sourceRefresh
    return reason
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
    const capability = pageEditCapability(this.#state.ir?.doc, section)
    if (isAgentChanging(this.#state)) return { rename: false, move: false, reason: this.#messages.saveLocked }
    if (this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isEditingVoice || this.#state.isHistoryBusy) return { rename: false, move: false, reason: this.#messages.pageEditBusy }
    return { ...capability, ...capability.reason ? { reason: this.#pageEditMessage(capability.reason) } : {} }
  }

  clearPageEditFailure(): void { this.#set({ pageEditFailure: undefined }) }

  /** The preview acknowledges that all registered lecture playback has paused before audition audio starts. */
  pausePlayback(): Promise<void> { return this.#playback.pause() }

  /** The owner must invalidate pending audio responses as well as stop its current audio element. */
  registerAudition(stop: () => void): () => void { return this.#playback.registerAudition(stop) }

  stopAuditions(): void { this.#playback.stopAuditions() }

  readVoiceover(): void {
    const document = this.#state.document
    if (document === undefined) return
    if (this.#voiceoverDocument !== document) {
      this.#voiceoverDocument = document
      this.#voiceover.subscribe(document)
    } else void this.#voiceover.read()
  }
  async startVoiceover(request: VoiceoverRequest): Promise<void> {
    const document = this.#state.document, scope = this.#narrationScope
    await this.flushPendingEdits({ includeNarration: true })
    await this.pausePlayback()
    if (document !== this.#state.document || scope !== this.#narrationScope) throw new Error('voice-context-changed')
    this.readVoiceover()
    await this.#voiceover.start(request)
  }
  cancelVoiceover(id: string): Promise<void> { return this.#voiceover.cancel(id) }

  /** Voice properties use the same source-write queue and acknowledgement boundary as body and script edits. */
  async saveVoiceSettings(update: VoiceSettingsUpdate): Promise<VoiceSettingsChange> {
    const document = this.#state.document, scope = this.#narrationScope
    const current = () => document !== undefined && document === this.#state.document && scope === this.#narrationScope
    if (document === undefined || this.#state.isEditingPage || this.#state.isCreatingPage || this.#state.isEditingVoice || this.#state.isHistoryBusy) throw new Error('voice-context-changed')
    this.#set({ isEditingVoice: true })
    try {
      await this.flushPendingEdits({ includeNarration: true })
      await this.pausePlayback()
      const work = this.#edits.then(async () => {
        if (!current() || this.#state.ir?.revision !== update.revision) throw new Error('voice-context-changed')
        if (isAgentChanging(this.#state)) throw new Error(this.#messages.saveLocked)
        this.#set({ save: { kind: 'saving' } })
        const changed = await this.client.updateVoiceSettings(document, { ...update, apply: true })
        if (!changed.applied || !changed.sourceVersion) throw new Error('voice-confirmation')
        if (changed.sourceVersion !== update.base) await waitForSourceRevision(this.client, document, update.revision)
        const source = await this.client.readSource(WORKSPACE_SCOPE, changed.source.path)
        if (source.version !== changed.sourceVersion) throw new Error('voice-context-changed')
        const confirmed = await this.client.readVoiceSettings(document)
        if (confirmed.source.version !== changed.sourceVersion) throw new Error('voice-context-changed')
        if (!current()) throw new Error('voice-context-changed')
        if (current()) {
          await this.#readIr(document)
          await this.#history.read(document)
          if (current()) this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
        }
        return { ...changed, ...confirmed }
      })
      this.#edits = work.then(() => {}, () => {})
      return await work
    } catch (error) {
      if (current() && this.#state.save.kind === 'saving') this.#set({ save: { kind: 'failed', message: this.#messages.voiceSaveUnconfirmed } })
      throw error
    } finally { if (current()) this.#set({ isEditingVoice: false }) }
  }

  /** Flush before entering the source-write queue: the viewer's body save itself needs that queue. */
  async flushPendingEdits(options: { includeNarration?: boolean } = {}): Promise<void> {
    const document = this.#state.document
    const scope = this.#narrationScope
    const sink = [...this.#previewSinks].find(sink => sink.capabilities?.includes('flush'))
    if (document === undefined || !sink) throw new Error('preview-flush-unavailable')
    const generation = sink.generation
    const current = () => scope === this.#narrationScope && document === this.#state.document && this.#previewSinks.has(sink) && generation === sink.generation
    if (isAgentChanging(this.#state)) throw new Error('save-locked')
    const request = ++this.#pageSequence
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish('save-timeout'), 35_000)
      const finish = (error?: string) => {
        if (!this.#flushRequests.delete(request)) return
        clearTimeout(timer)
        if (error) reject(new Error(error))
        else resolve()
      }
      this.#flushRequests.set(request, { document, scope, sink, generation, finish })
      try { sink.send({ type: 'flush', request }) } catch { finish('preview-flush-unavailable') }
    })
    // `edited` is posted before `flushed`; its in-place title save is already in this queue.
    await this.#edits
    if (!current()) throw new Error('page-context-changed')
    if (this.#state.sourceDirty) throw new Error('source-draft')
    const drafts = narrationDrafts(this.client)
    if (options.includeNarration) for (;;) {
      if (!current()) throw new Error('page-context-changed')
      const next = Object.entries(drafts.snapshot()).find(([, entry]) => entry.document === document && (entry.dirty || entry.saving || entry.composing))
      if (!next) break
      const [key, entry] = next
      if (entry.saving || entry.composing) {
        await new Promise<void>((resolve, reject) => {
          let unsubscribe = () => {}, stop = () => {}
          const timer = setTimeout(() => finish('save-timeout'), 30_000)
          const finish = (error?: string) => { clearTimeout(timer); unsubscribe(); stop(); error ? reject(new Error(error)) : resolve() }
          const check = () => {
            if (!current()) return finish('page-context-changed')
            const active = drafts.snapshot()[key]
            if (!active?.saving && !active?.composing) finish()
          }
          unsubscribe = drafts.subscribe(check)
          stop = this.subscribe(check)
          check()
        })
      } else {
        if (entry.failure || !entry.draft) throw new Error('page-draft')
        await drafts.save(key, (draft, text, mode) => this.saveNarration(draft, text, mode))
        if (drafts.snapshot()[key]?.failure) throw new Error('page-draft')
      }
    }
    await this.#edits
    if (!current()) throw new Error('page-context-changed')
    if (isAgentChanging(this.#state)) throw new Error('save-locked')
    if (this.#state.bodyDirty || this.#state.nativeDirty || this.#state.editFallback || this.#state.save.kind === 'failed' || this.#state.save.kind === 'locked') throw new Error('page-draft')
    await this.#readIr(document)
    if (!current()) throw new Error('page-context-changed')
  }

  renamePage(section: string, title: string): Promise<boolean> {
    return this.#editPage(section, { kind: 'rename', title })
  }

  movePage(section: string, before: string | null): Promise<boolean> {
    return this.#editPage(section, { kind: 'move', before })
  }

  pageDeleteMessage(reason: string): string { return this.#pageEditMessage(reason) }

  async preparePageDeletion(section: string): Promise<PageDeletePlan> {
    const document = this.#state.document, scope = this.#narrationScope
    if (document === undefined || !this.#state.ir?.authoring?.deletePage) throw new Error(this.#messages.pageEditPreview)
    await this.flushPendingEdits()
    if (document !== this.#state.document || scope !== this.#narrationScope) throw new Error(this.#messages.pageEditChanged)
    return this.client.readPageDeletion(document, section)
  }

  async deletePage(plan: PageDeletePlan): Promise<boolean> {
    if (!plan.allowed || this.#state.document !== plan.document || this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isHistoryBusy) return false
    const document = plan.document, scope = this.#narrationScope
    const current = () => document === this.#state.document && scope === this.#narrationScope
    this.#bodyHistory.reset()
    this.#set({ isEditingPage: true, pageEditFailure: undefined })
    try {
      await this.flushPendingEdits()
      if (!current()) return false
      const work = this.#edits.then(async () => {
        if (!current() || isAgentChanging(this.#state)) throw new Error('page-context-changed')
        const result = await this.client.deletePage(document, { section: plan.section, revision: plan.revision, base: plan.source.version })
        if (!current()) return false
        await this.#readIr(document)
        await this.#history.read(document)
        if (!current()) return false
        if (this.#state.ir?.revision !== result.irRevision) throw new Error('source-refresh')
        this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
        this.goToSection(result.selected)
        this.#record('page.delete', { 'presmium.section': plan.section, 'presmium.retainedEmpty': result.retainedEmpty })
        return true
      })
      this.#edits = work.then(() => {}, () => {})
      return await work
    } catch (error) {
      if (current()) this.#set({ pageEditFailure: this.#pageEditMessage(errorMessage(error)) })
      return false
    } finally { if (current()) this.#set({ isEditingPage: false }) }
  }

  async #editPage(section: string, operation: { kind: 'rename', title: string } | { kind: 'move', before: string | null }): Promise<boolean> {
    if (this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isEditingVoice || this.#state.isHistoryBusy) return false
    const document = this.#state.document
    const scope = this.#narrationScope
    const current = () => document !== undefined && document === this.#state.document && scope === this.#narrationScope
    if (document === undefined) return false
    let sourceSaved = false
    this.#bodyHistory.reset()
    this.#set({ isEditingPage: true, pageEditFailure: undefined })
    try {
      await this.flushPendingEdits()
      if (!current()) throw new Error('page-context-changed')
      const work = this.#edits.then(async () => {
        if (!current()) throw new Error('page-context-changed')
        if (isAgentChanging(this.#state)) throw new Error('save-locked')
        const answer = this.#state.ir
        const target = answer?.doc.sections.find(page => page.id === section)
        if (!answer || !target) throw new Error('page-boundary')
        const source = await this.client.readSource(WORKSPACE_SCOPE, answer.doc.meta.entry)
        if (!current() || this.#state.ir?.revision !== answer.revision) throw new Error('page-context-changed')
        const content = operation.kind === 'rename'
          ? renamePageSource(answer.doc, section, source.content, operation.title, answer.sourceCapabilities)
          : movePageSource(answer.doc, section, operation.before, source.content, answer.sourceCapabilities)
        if (content === source.content) return true
        const position = this.#state.position
        const ids = answer.doc.sections.map(page => page.id)
        if (operation.kind === 'move') {
          ids.splice(ids.indexOf(section), 1)
          const index = operation.before === null ? ids.length : ids.indexOf(operation.before)
          if (index < 0) throw new Error('page-boundary')
          ids.splice(index, 0, section)
        }
        this.#set({ save: { kind: 'saving' } })
        const saved = await this.client.saveSource(WORKSPACE_SCOPE, source.path, content, source.version, operation.kind === 'rename' ? this.#messages.pageRenamed(operation.title.trim()) : this.#messages.pageMoved(target.title))
        sourceSaved = true
        const updated = await waitForSourceRevision(this.client, document, answer.revision)
        const confirmed = await this.client.readSource(WORKSPACE_SCOPE, source.path)
        if (!current()) throw new Error('page-context-changed')
        if (confirmed.version !== saved.version) throw new Error('revision-conflict')
        if (JSON.stringify(updated.doc.sections.map(page => page.id)) !== JSON.stringify(ids)
          || answer.doc.sections.some(page => {
            const changed = updated.doc.sections.find(next => next.id === page.id)
            return !changed || page.steps !== changed.steps || JSON.stringify(stepKeys(page)) !== JSON.stringify(stepKeys(changed))
          }) || operation.kind === 'rename' && updated.doc.sections.find(page => page.id === section)?.title !== operation.title.trim()) throw new Error('source-refresh')
        await this.#readIr(document)
        await this.#history.read(document)
        if (!current()) throw new Error('page-context-changed')
        this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
        if (position && this.#state.ir?.doc.sections.some(page => page.id === position.section)) this.goToStep(position.section, position.step)
        this.#record(`page.${operation.kind}`, { 'presmium.section': section, ...operation.kind === 'move' ? { 'presmium.before': operation.before ?? '' } : {} })
        return true
      })
      this.#edits = work.then(() => {}, () => {})
      return await work
    } catch (error) {
      const reason = error instanceof WorkspaceServerError && error.status === 409 ? 'revision-conflict' : errorMessage(error)
      if (current()) {
        const message = sourceSaved ? this.#messages.pageEditRefresh : this.#pageEditMessage(reason)
        this.#set({ pageEditFailure: message, ...this.#state.save.kind === 'saving' ? { save: { kind: 'failed', message } as SaveState } : {} })
      }
      this.#record(`page.${operation.kind}.failed`, { 'presmium.section': section, 'presmium.error': reason })
      return false
    } finally {
      if (current()) this.#set({ isEditingPage: false })
    }
  }

  /** The canvas finishes pending body edits before asking to insert a page into their source. */
  createPage(after = this.#state.position?.section): void {
    if (this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isEditingVoice || this.#state.mode !== 'editing' || this.#state.webView !== 'document' || this.#state.previewRenderer !== 'web' || isAgentChanging(this.#state)) return
    const dir = this.#state.document
    const doc = this.#state.ir?.doc
    const section = doc?.sections.find(section => section.id === after) ?? doc?.sections[0]
    if (dir === undefined || !section || !this.#previewSinks.size) return
    this.#bodyHistory.reset()
    const request = ++this.#pageSequence
    const id = `page-${crypto.randomUUID()}`
    this.#beginPageRequest(dir, section.id, id, request)
    this.#broadcast({ type: 'page-insert', section: section.id, id, request })
  }

  #beginPageRequest(document: string, section: string, id: string, request: number): void {
    const timer = setTimeout(() => {
      if (this.#pageRequest?.request !== request) return
      this.#endPageRequest(request)
      if (this.#state.document === document) this.#set({ save: { kind: 'failed', message: this.#messages.pageTimeout } })
    }, 40_000)
    this.#pageRequest = { document, section, id, request, timer }
    this.#set({ isCreatingPage: true })
  }

  #endPageRequest(request: number): void {
    if (this.#pageRequest?.request !== request) return
    clearTimeout(this.#pageRequest.timer)
    this.#pageRequest = undefined
    this.#set({ isCreatingPage: false })
  }

  async #createPage(report: Extract<PreviewReport, { type: 'page-create' }>, current: () => boolean): Promise<void> {
    const dir = this.#state.document
    const pending = this.#pageRequest
    const reply = (page?: string, error?: string) => {
      if (current()) this.#broadcast({ type: 'page-created', section: report.section, request: report.request, ...page ? { page } : {}, ...error ? { error } : {} })
    }
    if (pending && (pending.request !== report.request || pending.id !== report.id || pending.section !== report.section)) return reply(undefined, this.#messages.saveLocked)
    if (dir === undefined || this.#state.mode !== 'editing' || isAgentChanging(this.#state)) {
      this.#endPageRequest(report.request)
      return reply(undefined, this.#messages.saveLocked)
    }
    if (!pending) this.#beginPageRequest(dir, report.section, report.id, report.request)
    try {
      const answer = this.#state.ir
      const section = answer?.doc.sections.find(section => section.id === report.section)
      if (!answer || !section || answer.doc.sections.some(section => section.id === report.id)) throw new Error(this.#messages.blockUnknown)
      if (report.revision !== answer.revision) throw new Error(this.#messages.blockConflict)
      const source = await this.client.readSource(WORKSPACE_SCOPE, section.source.file)
      const content = writePage(answer.doc, section, source.content, report.id, this.#messages.untitledPage)
      if (!current() || this.#state.ir?.revision !== answer.revision) throw new Error(this.#messages.blockConflict)
      this.#set({ save: { kind: 'saving' } })
      await this.client.saveSource(WORKSPACE_SCOPE, source.path, content, source.version, this.#messages.createdPage)
      if (!current()) return
      await this.#waitForSourceBlock(dir, report.id)
      await this.#history.read(dir)
      if (!current()) return
      this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
      this.goToSection(report.id)
      this.#record('page.create', { 'presmium.section': report.id, 'presmium.after': section.id })
      reply(report.id)
    } catch (error) {
      const reason = errorMessage(error)
      const message = ['page-boundary', 'page-multiple-files'].includes(reason) ? this.#messages.pageBoundary : this.#sourceError(error)
      if (current()) this.#set({ save: { kind: 'failed', message } })
      reply(undefined, message)
    } finally {
      this.#endPageRequest(report.request)
    }
  }

  #rememberBlockSource(key: string, draft: BlockSourceDraft): void {
    this.#blockSources.delete(key)
    this.#blockSources.set(key, draft)
    const bytes = () => [...this.#blockSources.values()].reduce((size, value) => size + (value.source.content.length + value.content.length) * 2, 0)
    while (this.#blockSources.size > 1 && (this.#blockSources.size > 32 || bytes() > 16 << 20))
      this.#blockSources.delete(this.#blockSources.keys().next().value!)
  }

  async #readBlockSource(report: Extract<PreviewReport, { type: 'source-read' }>, current: () => boolean): Promise<void> {
    const dir = this.#state.document
    const answer = this.#state.ir
    const reply = (source?: ReturnType<typeof previewBlockSource>, error?: string) => {
      if (current()) this.#broadcast({ type: 'source-result', section: report.section, block: report.block, request: report.request, ...source ? { source } : {}, ...error ? { error } : {} })
    }
    if (dir === undefined || !answer) return reply(undefined, this.#messages.sourceUnknown)
    if (this.#state.mode !== 'editing') return reply(undefined, this.#messages.saveLocked)
    try {
      const target = blockSourceTarget(answer.doc, report.section, report.block, report.part)
      const source = await this.client.readSource(WORKSPACE_SCOPE, target.path)
      if (!current()) return
      if (this.#state.ir?.revision !== answer.revision) throw new Error('source-changed')
      const key = `${report.section}\0${report.block}\0${target.part}`
      const draft = readBlockSource(answer.doc, report.section, report.block, source, target.part, this.#blockSources.get(key))
      this.#rememberBlockSource(key, draft)
      this.#record('source.read', { 'presmium.section': report.section, 'presmium.block': report.block, 'presmium.part': target.part })
      reply(previewBlockSource(draft))
    } catch (error) {
      reply(undefined, this.#sourceError(error))
    }
  }

  async #saveBlockSource(report: Extract<PreviewReport, { type: 'source-save' }>, current: () => boolean): Promise<void> {
    const dir = this.#state.document
    const reply = (version?: string, error?: string) => {
      if (current()) this.#broadcast({ type: 'source-saved', section: report.section, block: report.block, request: report.request, ...version ? { sourceVersion: version } : {}, ...error ? { error } : {} })
    }
    if (dir === undefined || !this.#state.ir) return reply(undefined, this.#messages.sourceUnknown)
    if (this.#state.mode !== 'editing' || isAgentChanging(this.#state)) return reply(undefined, this.#messages.saveLocked)
    try {
      const target = blockSourceTarget(this.#state.ir.doc, report.section, report.block, report.part)
      const key = `${report.section}\0${report.block}\0${target.part}`
      const draft = this.#blockSources.get(key)
      if (!draft) throw new Error('source-changed')
      const content = writeBlockSource(this.#state.ir.doc, draft, report.path, report.base, report.content)
      this.#set({ save: { kind: 'saving' } })
      const title = this.#state.ir.doc.sections.find(section => section.id === report.section)!.title
      const saved = await this.client.saveSource(WORKSPACE_SCOPE, draft.source.path, content, draft.source.version, this.#messages.editedSource(title))
      if (!current()) return
      // The read snapshot stays usable even when the edited source does not compile yet.
      this.#rememberBlockSource(key, savedBlockSource(draft, content, report.content, saved.version))
      await this.#readIr(dir)
      await this.#history.read(dir)
      if (!current()) return
      this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
      this.#record('source.save', { 'presmium.section': report.section, 'presmium.block': report.block, 'presmium.part': target.part })
      reply(saved.version)
    } catch (error) {
      const message = this.#sourceError(error)
      if (current()) this.#set({ save: { kind: 'failed', message } })
      reply(undefined, message)
    }
  }

  async #createSourceBlock(report: Extract<PreviewReport, { type: 'source-create' }>, current: () => boolean): Promise<void> {
    const dir = this.#state.document
    const answer = this.#state.ir
    const section = answer?.doc.sections.find(section => section.id === report.section)
    const reply = (block?: string, error?: string) => {
      if (current()) this.#broadcast({ type: 'source-created', section: report.section, request: report.request, ...block ? { block } : {}, ...error ? { error } : {} })
    }
    if (dir === undefined || !answer || !section) return reply(undefined, this.#messages.sourceUnknown)
    if (this.#state.mode !== 'editing' || isAgentChanging(this.#state)) return reply(undefined, this.#messages.saveLocked)
    if (report.revision !== answer.revision) return reply(undefined, this.#messages.blockConflict)
    const motion = answer.doc.config.presmium['presmium.motion'] as { starter?: { code?: unknown } } | undefined
    const starter = motion?.starter?.code
    if (typeof starter !== 'string') return reply(undefined, this.#messages.sourceAnimationUnavailable)
    try {
      const originals = bodyBlocks(section, answer.doc)
      const after = report.after === undefined ? originals.at(-1) : originals.find(block => block.id === report.after)
      if (report.after !== undefined && !after) throw new Error('source-changed')
      const id = report.id
      if (answer.doc.sections.some(section => [...irBlocks(section.blocks)].some(block => block.id === id))) throw new Error('source-changed')
      const entryDir = answer.doc.meta.entry.includes('/') ? answer.doc.meta.entry.slice(0, answer.doc.meta.entry.lastIndexOf('/') + 1) : ''
      const path = `${entryDir}scenes/${id}.ts`
      const at = after ? after.at + (after.span ?? 0) + (after.node.type === 'component' && after.node.durations ? 1 : 0) : 0
      const blocks = originals.map(block => ({ id: block.id, source: block.id }))
      const insertAt = after ? originals.indexOf(after) + 1 : 0
      const source = await this.client.readSource(WORKSPACE_SCOPE, section.source.file)
      const content = writeBodyBlocks(answer.doc, section, source.content, [...blocks.slice(0, insertAt), { id, scene: id, durations: [1000], at }, ...blocks.slice(insertAt)])
      if (!current()) return
      if (this.#state.ir?.revision !== answer.revision) throw new Error('source-changed')
      const code = starter
      this.#set({ save: { kind: 'saving' } })
      await this.client.saveSourceTransaction(dir, [{ path, content: code, base: null }, { path: source.path, content, base: source.version }], this.#messages.createdAnimation)
      if (!current()) return
      await this.#waitForSourceBlock(dir, report.section, id)
      await this.#history.read(dir)
      if (!current()) return
      this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
      this.#record('source.create', { 'presmium.section': report.section, 'presmium.block': id })
      reply(id)
    } catch (error) {
      const message = this.#sourceError(error)
      if (current()) this.#set({ save: { kind: 'failed', message } })
      reply(undefined, message)
    }
  }

  /** Filesystem compilation is asynchronous; a completed IR request can still describe the pre-insert document. */
  #waitForSourceBlock(dir: string, section: string, block?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let finished = false
      let unsubscribe = () => {}
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        unsubscribe()
        if (error) reject(error)
        else resolve()
      }
      const check = () => {
        if (this.#state.document !== dir) return finish(new Error('source-changed'))
        const page = this.#state.ir?.doc.sections.find(page => page.id === section)
        if (page && (block === undefined || [...irBlocks(page.blocks)].some(candidate => candidate.id === block))) finish()
      }
      const timer = setTimeout(() => finish(new Error('source-refresh')), 20_000)
      unsubscribe = this.subscribe(check)
      check()
      if (!finished) void this.#readIr(dir).then(check)
    })
  }

  /** Whether the target's text is plain enough to edit in place. */
  isEditable(target: PreviewAnchor): boolean {
    const doc = this.#state.ir?.doc
    const section = doc?.sections.find(s => s.id === target.section)
    if (!section) return false
    if (!target.block) return true
    const block = [...irBlocks(section.blocks)].find(b => b.id === target.block)
    if (block?.node.type !== 'markdown') return false
    const { mdast } = block.node
    const parts = mdast.type === 'root' ? mdast.children ?? [] : [mdast]
    return parts.length > 0 && parts.every(part => EDITABLE.has(part.type))
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

  /** Edits the target's text in place in the preview; none ends editing without saving. */
  editText(target: PreviewAnchor | null, at?: PreviewPoint): void {
    if (target && (isAgentChanging(this.#state) || !this.isEditable(target))) return
    const opened = this.#state.ir
    if (target && this.#state.previewIrRevision !== opened?.revision) return
    const binding = target && opened ? previewEditBinding(opened.doc, target) : undefined
    if (target && !binding) return
    if (target) this.#record('edit.start', { 'presmium.section': target.section, 'presmium.block': target.block })
    else if (this.#state.editing) this.#record('edit.cancel', { 'presmium.section': this.#state.editing.section, 'presmium.block': this.#state.editing.block })
    if (target) {
      this.#set({ pointer: undefined, editFallback: undefined })
      this.#broadcast({ type: 'highlight', target: null })
    }
    this.#broadcast({ type: 'edit', target, ...at ? { at } : {}, ...target && opened && binding ? { revision: opened.revision, binding } : {} })
  }

  #sourceOf(target: PreviewAnchor, doc: IRDocument): { file: string, line: number, endLine?: number } | undefined {
    if (!target.block) {
      const section = doc.sections.find(s => s.id === target.section)
      return section && { file: section.source.file, line: section.source.line }
    }
    return findPlaceSource(doc, target.section, target.block)?.source
  }

  /** A committed native edit belongs to its original document, even while another document is selected. */
  #saveNativeEdit(document: string, renderer: PreviewRenderer, report: Extract<PreviewReport, { type: 'edited' }> & { request: number, revision: string, binding: string }, origin: PreviewSink): void {
    const scope = this.#narrationScope, generation = origin.generation
    const current = () => scope === this.#narrationScope && document === this.#state.document && renderer === this.#state.previewRenderer && this.#previewSinks.has(origin) && generation === origin.generation
    const reply = (error?: string, revision?: string, binding?: string) => {
      if (origin.generation === generation) origin.send({ type: 'edit-result', request: report.request, target: report.target, ...error ? { error } : { revision, binding } })
    }
    const receiptKey = fnv1a64(JSON.stringify([document, renderer, report.target, report.binding, report.before, report.after]))
    const message = (reason: string) => reason === 'native-target' ? this.#messages.nativeEditTarget : reason === 'native-format' ? this.#messages.nativeEditFormat : reason === 'native-confirmation' ? this.#messages.nativeEditConfirmation : reason === 'native-unavailable' ? this.#messages.nativeEditUnavailable : reason === 'native-conflict' ? this.#messages.nativeEditConflict : reason === 'save-locked' ? this.#messages.saveLocked : reason.startsWith('page-') ? this.#pageEditMessage(reason) : reason
    if (current()) { this.#bodyHistory.reset(); this.#set({ save: { kind: 'saving' }, editFallback: undefined }) }
    this.#edits = this.#edits.then(async () => {
      let wrote = false
      let submitted = false
      try {
        const opened = await this.client.readIr(document)
        const targetBinding = previewEditBinding(opened.doc, report.target)
        if (!targetBinding) throw new Error('native-target')
        const receipt = this.#nativeReceipts.get(receiptKey)
        if (receipt && receipt.binding === targetBinding) {
          const source = await this.client.readSource(WORKSPACE_SCOPE, receipt.path)
          if (source.version === receipt.version) {
            if (current()) this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
            return reply(undefined, opened.revision, targetBinding)
          }
          this.#nativeReceipts.delete(receiptKey)
        }
        if (targetBinding !== report.binding) throw new Error('native-conflict')
        const location = this.#sourceOf(report.target, opened.doc)
        if (!location) throw new Error('native-target')
        const source = await this.client.readSource(WORKSPACE_SCOPE, location.file)
        if (!opened.sourceFingerprints?.[source.path]) throw new Error('native-unavailable')
        if (opened.sourceFingerprints[source.path] !== fnv1a64(source.content)) throw new Error('native-conflict')
        // Re-read the IR after the source read: a line map from another revision cannot be adopted.
        if ((await this.client.readIr(document)).revision !== opened.revision) throw new Error('native-conflict')
        const edited = applyRenderedEdit(source.content, location, report.before, report.after)
        if (!edited.ok) throw new Error('native-format')
        let content = edited.content
        if (!report.target.block && content !== source.content) {
          try { content = renamePageSource(opened.doc, report.target.section, source.content, report.after, opened.sourceCapabilities) }
          catch (error) {
            if (errorMessage(error) !== 'page-formatted-title') throw error
            content = pinPageSource(opened.doc, report.target.section, content, opened.sourceCapabilities)
          }
        }
        const changed = content !== source.content
        const title = opened.doc.sections.find(section => section.id === report.target.section)?.title ?? ''
        submitted = changed
        const saved = changed ? await this.client.saveSource(WORKSPACE_SCOPE, source.path, content, source.version, this.#messages.editedSection(title)) : { version: source.version }
        wrote = changed
        const compiled = changed ? await waitForSourceRevision(this.client, document, opened.revision) : opened
        const confirmed = await this.client.readSource(WORKSPACE_SCOPE, source.path)
        const binding = previewEditBinding(compiled.doc, report.target)
        if (confirmed.version !== saved.version || !binding) throw new Error('native-confirmation')
        this.#nativeReceipts.set(receiptKey, { path: source.path, version: saved.version, revision: compiled.revision, binding })
        while (this.#nativeReceipts.size > 64) this.#nativeReceipts.delete(this.#nativeReceipts.keys().next().value!)
        if (current()) {
          await this.#readIr(document)
          await this.#history.read(document)
          if (current()) this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
        }
        this.#record('edit.save', { 'presmium.document': document, 'presmium.section': report.target.section, 'presmium.block': report.target.block, 'presmium.outcome': 'saved' })
        reply(undefined, compiled.revision, binding)
      } catch (error) {
        const reason = error instanceof WorkspaceServerError && error.answer.locked ? 'save-locked' : error instanceof WorkspaceServerError && error.answer.conflict ? 'native-conflict' : wrote || submitted && !(error instanceof WorkspaceServerError) ? 'native-confirmation' : errorMessage(error)
        if (current()) this.#set({ save: { kind: 'failed', message: message(reason) } })
        this.#record('edit.save', { 'presmium.document': document, 'presmium.section': report.target.section, 'presmium.block': report.target.block, 'presmium.outcome': 'failed', 'presmium.error': reason })
        reply(reason)
      }
    })
  }

  #saveEdit(target: PreviewAnchor, before: string, after: string): void {
    const document = this.#state.document
    const doc = this.#state.ir?.doc
    if (document === undefined || !doc) return
    const scope = this.#narrationScope
    const currentDocument = () => document === this.#state.document && scope === this.#narrationScope
    const title = doc.sections.find(s => s.id === target.section)?.title ?? ''
    const started = Date.now()
    const saved = (outcome: string, error?: string) => this.#record('edit.save', { 'presmium.section': target.section, 'presmium.block': target.block, 'presmium.before': before, 'presmium.after': after, 'presmium.outcome': outcome, 'presmium.error': error, 'presmium.ms': Date.now() - started })
    this.#set({ save: { kind: 'saving' }, editFallback: undefined })
    this.#edits = this.#edits.then(async () => {
      if (!currentDocument()) return
      const opened = this.#state.ir
      const source = opened && this.#sourceOf(target, opened.doc)
      const fallBack = () => {
        if (!currentDocument()) return
        saved('fallback')
        this.#set({ save: { kind: 'idle' }, editFallback: { target, before, after } })
        this.#reloadPreview()
      }
      if (!source || !opened) return fallBack()
      try {
        for (let attempt = 0; ; attempt++) {
          const current = await this.client.readSource(WORKSPACE_SCOPE, source.file)
          if (!currentDocument()) return
          if (this.#state.ir?.revision !== opened.revision) throw new Error(this.#messages.blockConflict)
          const edited = applyRenderedEdit(current.content, source, before, after)
          if (!edited.ok) return fallBack()
          let content = edited.content
          if (!target.block && content !== current.content) {
            try { content = renamePageSource(opened.doc, target.section, current.content, after, opened.sourceCapabilities) }
            catch (error) {
              if (errorMessage(error) !== 'page-formatted-title') throw error
              content = pinPageSource(opened.doc, target.section, content, opened.sourceCapabilities)
            }
          }
          try {
            if (content !== current.content) {
              const saved = await this.client.saveSource(WORKSPACE_SCOPE, source.file, content, current.version, this.#messages.editedSection(title))
              await waitForSourceRevision(this.client, document, opened.revision)
              const confirmed = await this.client.readSource(WORKSPACE_SCOPE, source.file)
              if (confirmed.version !== saved.version) throw new Error(this.#messages.blockConflict)
              if (currentDocument()) await this.#readIr(document)
            }
            break
          } catch (error) {
            // Changed on disk between the read and the save: read it again once.
            if (attempt > 0 || !(error instanceof WorkspaceServerError && error.answer.conflict)) throw error
          }
        }
        saved('saved')
        if (currentDocument()) {
          this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
          void this.#history.read(document)
        }
      } catch (error) {
        const locked = error instanceof WorkspaceServerError && error.answer.locked
        saved(locked ? 'locked' : 'failed', errorMessage(error))
        if (!currentDocument()) return
        const reason = errorMessage(error)
        this.#set({ save: locked ? { kind: 'locked' } : { kind: 'failed', message: reason.startsWith('page-') ? this.#pageEditMessage(reason) : this.#sourceError(error) } })
        this.#reloadPreview()
      }
    })
  }

  dismissEditFallback(): void {
    this.#record('edit.fallback.dismiss')
    this.#set({ editFallback: undefined })
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

  #setComments(comments: DocumentComment[]): void {
    this.#set({ comments })
    this.#broadcast({ type: 'pins', targets: commentPins(comments) })
  }

  #writeComments(comments: DocumentComment[]): void {
    const document = this.#state.document
    if (document === undefined) return
    this.#comments.write(document, comments)
    this.#setComments(comments)
  }

  /** Leaves a comment on what the author points at. */
  addComment(text: string, pointer = this.#state.pointer): DocumentComment | undefined {
    if (!pointer || !text.trim()) return undefined
    const comment = newComment(pointer.target, text.trim(), pointer.quote)
    this.#record('comment.add', { 'presmium.comment': comment.id, 'presmium.section': comment.section, 'presmium.block': comment.block, 'presmium.quote': comment.quote, 'presmium.text': comment.text })
    this.#writeComments([...this.#state.comments, comment])
    this.point(undefined)
    return comment
  }

  setCommentStatus(id: string, status: DocumentComment['status']): void {
    this.#record('comment.status', { 'presmium.comment': id, 'presmium.status': status })
    this.#writeComments(this.#state.comments.map(comment => (comment.id === id ? { ...comment, status } : comment)))
  }

  removeComment(id: string): void {
    this.#record('comment.remove', { 'presmium.comment': id })
    this.#writeComments(this.#state.comments.filter(comment => comment.id !== id))
  }

  /** Sends the comments (all those not yet sent, by default) to the AI in one message; they are then sent, no longer pending. */
  async askAgentAboutComments(ids = this.#state.comments.filter(comment => comment.status === 'open').map(comment => comment.id)): Promise<boolean> {
    const chosen = this.#state.comments.filter(comment => ids.includes(comment.id))
    if (chosen.length === 0) return false
    const focus = chosen.map((comment, i): FocusReport => ({ id: `comment-${i + 1}`, from: this.#state.previewRenderer, section: comment.section, ...comment.block ? { block: comment.block } : {}, ...comment.quote ? { quote: comment.quote } : {} }))
    const asked = await this.#ask('comments', focus, places => this.#messages.commentsRequest(chosen.map((comment, i) => ({ ...places.get(focus[i]!.id) ?? this.#describe(focus[i]!), text: comment.text }))))
    if (asked) this.#writeComments(this.#state.comments.map(comment => (ids.includes(comment.id) ? { ...comment, status: 'sent' as const } : comment)))
    return asked
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
    this.goToStep(section, this.#selectedSteps.get(`${this.#state.document}\0${section}`) ?? 0)
  }

  /** Complete-IR position; trail maps the same step into a filtered preview without reusing its ordinal. */
  goToStep(section: string, step: number): void {
    const target = this.#state.ir?.doc.sections.find(item => item.id === section)
    if (!target || !Number.isInteger(step) || step < 0 || step > target.steps) return
    const trail = stepTrail(stepKeys(target), step)
    this.#set({ position: { section, step, trail, view: this.#state.webView }, ...this.#state.narration ? { narration: { section, step } } : {} })
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

  undo(): Promise<boolean> { return this.#changeHistory('undo') }
  redo(): Promise<boolean> { return this.#changeHistory('redo') }

  async #changeHistory(action: 'undo' | 'redo' | 'revert', revision?: string): Promise<boolean> {
    if (this.#state.mode !== 'editing' || this.#state.isCreatingPage || this.#state.isEditingPage || this.#state.isEditingVoice || this.#state.isHistoryBusy || this.#state.isHistoryPreparing) return false
    const document = this.#state.document, scope = this.#narrationScope
    if (document === undefined) return false
    const current = () => this.#state.document === document && this.#narrationScope === scope
    this.#set({ isHistoryPreparing: true, historyFailure: undefined })
    try {
      if (action !== 'revert' && await this.#bodyHistory.perform(action)) return true
      if (!current()) return false
      this.#bodyHistory.reset()
      await this.flushPendingEdits()
      if (!current()) return false
      await this.#history.read(document)
      if (!current()) return false
      return await this.#timed(`history.${action}`, revision ? { 'presmium.revision': revision } : {}, () => action === 'revert' ? this.#history.revert(revision!) : this.#history[action](), done => done ? 'done' : 'refused')
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
    return this.#timed('job.start', { 'presmium.job.target': target }, () => this.#jobs.start(target))
  }

  cancelJob(id: string): Promise<void> {
    return this.#timed('job.cancel', { 'presmium.job.id': id }, () => this.#jobs.cancel(id))
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
    sink.send({ type: 'pick', on: this.#state.mode === 'editing' })
    const reveal = this.#pendingReveal
    this.#pendingReveal = undefined
    if (reveal) sink.send({ type: 'go', section: reveal.section })
    sink.send({ type: 'highlight', target: reveal ?? this.#state.pointer?.target ?? null })
    sink.send({ type: 'pins', targets: commentPins(this.#state.comments) })
    return () => {
      this.#previewSinks.delete(sink)
      this.#playback.detach(sink)
      this.#bodyHistory.detach(sink)
      for (const pending of this.#flushRequests.values()) if (pending.sink === sink) pending.finish('page-context-changed')
    }
  }

  /** A report of the shown preview. */
  handlePreviewReport(document: string, renderer: PreviewRenderer, report: PreviewReport, origin?: PreviewSink): void {
    if (report.type === 'edited' && report.request !== undefined && report.revision !== undefined && report.binding !== undefined && origin) {
      this.#saveNativeEdit(document, renderer, { ...report, request: report.request, revision: report.revision, binding: report.binding }, origin)
      return
    }
    if (document !== this.#state.document || renderer !== this.#state.previewRenderer) {
      if (report.type === 'blocks-edited') origin?.send({ type: 'blocks-result', section: report.section, request: report.request, error: 'document-inactive' })
      return
    }
    this.#playback.report(document, report, origin)
    this.#bodyHistory.report(document, report, origin)
    const scope = this.#narrationScope
    const generation = origin?.generation
    const current = () => scope === this.#narrationScope && document === this.#state.document && renderer === this.#state.previewRenderer && (!origin || this.#previewSinks.has(origin) && generation === origin.generation)
    switch (report.type) {
      case 'flushed': {
        const pending = this.#flushRequests.get(report.request)
        if (!pending || !origin || pending.sink !== origin || pending.document !== document || pending.scope !== scope) break
        pending.finish(pending.generation === origin.generation ? report.error : 'page-context-changed')
        break
      }
      case 'blocks-edited': {
        const result = (error?: string, revision?: string) => {
          if (error === 'document-inactive' && document === this.#state.document && renderer === this.#state.previewRenderer && origin && this.#previewSinks.has(origin) && generation === origin.generation) error = 'document-resumed'
          const answer: PreviewCommand = { type: 'blocks-result', section: report.section, request: report.request, ...error ? { error } : { revision } }
          if (origin && origin.generation === generation) origin.send(answer)
          else if (!origin && current()) this.#broadcast(answer)
        }
        this.#edits = this.#edits.then(() => {
          if (current()) return this.#saveBlocks(report, current, result)
          // The same retained editor may already have been selected again
          // while an earlier source operation held this queue. Revalidate it
          // against the new selection scope and its still-required IR revision.
          const resumedScope = this.#narrationScope
          const resumed = () => resumedScope === this.#narrationScope && document === this.#state.document && renderer === this.#state.previewRenderer && Boolean(origin && this.#previewSinks.has(origin) && generation === origin.generation)
          return resumed() ? this.#saveBlocks(report, resumed, result) : result('document-inactive')
        })
        break
      }
      case 'source-read':
        this.#edits = this.#edits.then(() => current() ? this.#readBlockSource(report, current) : undefined)
        break
      case 'source-save':
        this.#edits = this.#edits.then(() => current() ? this.#saveBlockSource(report, current) : undefined)
        break
      case 'source-create':
        this.#edits = this.#edits.then(() => current() ? this.#createSourceBlock(report, current) : undefined)
        break
      case 'source-draft':
        if (this.#state.sourceDirty !== report.dirty) this.#set({ sourceDirty: report.dirty })
        break
      case 'body-draft':
        if (this.#state.bodyDirty !== report.dirty) this.#set({ bodyDirty: report.dirty })
        break
      case 'native-draft':
        if (this.#state.nativeDirty !== report.dirty) this.#set({ nativeDirty: report.dirty })
        break
      case 'page-create':
        this.#edits = this.#edits.then(() => current() ? this.#createPage(report, current) : undefined)
        break
      case 'page-create-error':
        if (this.#pageRequest?.request === report.request) {
          this.#endPageRequest(report.request)
          const message = ['page-timeout', 'save-timeout'].includes(report.error) ? this.#messages.pageTimeout : report.error === 'revision-conflict' ? this.#messages.blockConflict : report.error === 'page-unavailable' ? this.#messages.blockUnknown : report.error
          this.#set({ save: { kind: 'failed', message } })
        }
        break
      case 'narrate':
        if (report.navigate === false) {
          const section = this.#state.ir?.doc.sections.find(section => section.id === report.section)
          if (section && report.step <= section.steps) this.#set({ position: { section: report.section, step: report.step, trail: stepTrail(stepKeys(section), report.step), view: this.#state.webView }, ...this.#state.narration ? { narration: { section: report.section, step: report.step } } : {} })
        } else this.selectNarration(report.section, report.step)
        break
      case 'ready':
      case 'updated':
        if (report.revision !== this.#state.previewIrRevision) this.#playback.stopAuditions()
        if (origin) for (const pending of this.#flushRequests.values()) if (pending.sink === origin && pending.generation !== origin.generation) pending.finish('page-context-changed')
        this.#set({ previewIrRevision: report.revision })
        this.#flashChanges()
        if (report.type === 'ready' && renderer === 'web' && this.#state.webView !== 'document') this.#showWebView()
        break
      case 'picked': {
        if (this.#state.editing || this.#state.mode !== 'editing') break
        const target: PreviewAnchor = { section: report.section, ...report.block ? { block: report.block } : {} }
        const isEditable = this.isEditable(target)
        if ((report.clicks ?? 1) >= 2 && isEditable) {
          this.editText(target, report.point)
          break
        }
        const section = this.#state.ir?.doc.sections.find(s => s.id === report.section)
        const step = section && report.trail ? trailStep(stepKeys(section), report.trail) : report.step
        this.point({ target, ...step === undefined ? {} : { step }, ...report.rect ? { rect: report.rect } : {}, ...report.point ? { point: report.point } : {}, isEditable })
        break
      }
      case 'selection': {
        if (this.#state.editing || this.#state.mode !== 'editing') break
        const selected = report.selection
        if (selected?.text.trim()) {
          const target: PreviewAnchor = { section: selected.section, ...selected.block ? { block: selected.block } : {} }
          this.point({ target, quote: selected.text.trim(), ...selected.rect ? { rect: selected.rect } : {}, ...selected.obstacles ? { obstacles: selected.obstacles } : {}, isEditable: this.isEditable(target) })
        } else if (this.#state.pointer?.quote) this.point(undefined)
        break
      }
      case 'rect':
        if (this.#state.pointer) this.#set({ pointer: { ...this.#state.pointer, rect: report.rect ?? undefined, obstacles: report.obstacles } })
        break
      case 'editing':
        this.#set({ editing: report.active ? report.target : undefined })
        break
      case 'edited':
        this.#bodyHistory.reset()
        this.#saveEdit(report.target, report.before, report.after)
        break
      case 'position': {
        // Where the author reads or presents: recorded when it moves to another section, step or view.
        const at = `${report.section}\0${report.step}\0${report.view ?? ''}`
        if (at === this.#lastPosition) break
        this.#lastPosition = at
        const section = this.#state.ir?.doc.sections.find(section => section.id === report.section)
        const completeStep = section && report.trail.length ? trailStep(stepKeys(section), report.trail) : report.step
        this.#selectedSteps.set(`${this.#state.document}\0${report.section}`, completeStep)
        this.#set({ position: { section: report.section, step: completeStep, trail: report.trail, ...report.view ? { view: report.view } : {} } })
        if (this.#state.narration && report.view === 'present') this.#set({ narration: { section: report.section, step: completeStep } })
        if (renderer === 'web' && report.view && (report.view === 'present') !== (this.#state.webView === 'present')) this.#set({ webView: report.view === 'present' ? 'present' : 'document' })
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

  /**
   * When the workbench starts on the documents, the one the author opened last is likely next: once the page is idle,
   * it is prepared as when the mouse rests on it.
   */
  #prewarmRecent(): void {
    if (this.#prewarmed || this.#state.document !== undefined) return
    this.#prewarmed = true
    let recent: string | null = null
    try {
      recent = localStorage.getItem(RECENT_KEY)
    } catch {}
    if (recent === null || !this.#state.documents?.documents.some(doc => doc.dir === recent)) return
    const dir = recent
    const prepare = () => {
      if (this.#state.document === undefined) this.prefetchDocument(dir)
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(prepare, { timeout: PREWARM_IDLE_MS })
    else setTimeout(prepare, PREWARM_IDLE_MS)
  }

  /**
   * The author is about to open a document (the mouse rests on it in the list): asks the service to compile it and start
   * its web dev server, once a document; the service does so only when the machine has room.
   */
  prefetchDocument(dir: string): void {
    if (this.#prefetched.has(`web:${dir}`) || dir === this.#state.document) return
    this.#prefetched.add(`web:${dir}`)
    void this.client.prefetchPreview(dir, 'web').catch(() => this.#prefetched.delete(`web:${dir}`))
  }

  #broadcast(command: PreviewCommand): void {
    for (const sink of this.#previewSinks) sink.send(command)
  }

  #stopSubscriptions(): void {
    this.#bodyBindings.clear()
    this.#playback.reset()
    this.#bodyHistory.reset()
    for (const pending of this.#flushRequests.values()) pending.finish('page-context-changed')
    if (this.#pageRequest) {
      clearTimeout(this.#pageRequest.timer)
      this.#pageRequest = undefined
    }
    this.#focusVersion++
    this.#pendingReveal = undefined
    this.#pendingFlash = undefined
    this.#unsubscribeIr?.()
    this.#unsubscribeIr = undefined
    this.#history.stop()
    this.#diagnostics.stop()
    this.#jobs.stop()
    this.#voiceover.stop()
    this.#voiceoverDocument = undefined
  }

  dispose(): void {
    this.#unsubscribeNarrationDrafts?.()
    this.telemetry.stop()
    this.#stopSubscriptions()
    this.#diagnostics.dispose()
  }
}
