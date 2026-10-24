import { errorMessage, irBlocks, stepKeys, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, Focus, FocusReport, IrAnswer, IrEvent, IRDocument, OperationAnswer, PreviewAnchor, PreviewAnswer, PreviewCommand, PreviewDiagnostics, PreviewPin, PreviewPoint, PreviewRect, PreviewRenderer, PreviewReport, ReviewChange, ReviewSnapshot, RevisionsAnswer, UncommittedFile } from '@lincyaw/kernel'
import { CommentStore, newComment } from './comments.ts'
import type { DocumentComment } from './comments.ts'
import { DocumentDiagnostics } from './diagnostics.ts'
import { DocumentHistory } from './history.ts'
import { localeOf, MESSAGES } from './messages.ts'
import type { AgentPlace, Locale } from './messages.ts'
import { changedPlaces, findPlaceAtLine, findPlaceSource } from './places.ts'
import { OperationLog } from './telemetry.ts'
import type { OperationValue } from './telemetry.ts'
import { applyRenderedEdit } from './text-edit.ts'
import { workspaceClient, WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'

/** `editing`: blocks are picked, commented on and edited in place; `viewing`: the document reads as its readers see it. */
export type WorkbenchMode = 'editing' | 'viewing'

/** What the author points at in the document: a block (or a section), or a passage selected in it. */
export interface Pointer {
  target: PreviewAnchor
  step?: number
  /** The selected passage. */
  quote?: string
  /** Its box in the preview's viewport; none while it is out of sight. */
  rect?: PreviewRect
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
  previewReload: number
  preview?: PreviewAnswer
  previewFailure?: string
  /** The IR revision the preview shows. */
  previewIrRevision?: string
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
}

export interface PreviewSink {
  send(command: PreviewCommand): void
}

type Listener = () => void

/** The workbench's state as its parts read and change it. */
export interface WorkbenchStore {
  readonly state: WorkbenchState
  set(patch: Partial<WorkbenchState>): void
}

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

/** The numbers on the blocks of the comments not yet sent, in order. */
function commentPins(comments: readonly DocumentComment[]): PreviewPin[] {
  return comments.filter(comment => comment.status === 'open' && comment.block).map((comment, i) => ({ id: comment.id, section: comment.section, block: comment.block!, label: String(i + 1) }))
}

/** What opening or closing a document clears. */
const DOCUMENT_RESET = {
  ir: undefined, preview: undefined, previewFailure: undefined, previewIrRevision: undefined,
  diagnostics: undefined, isDiagnosticsUnavailable: false, isRepairingDiagnostics: false, diagnosticsRepairFailure: undefined,
  pointer: undefined, editing: undefined, save: { kind: 'idle' }, editFallback: undefined,
  focus: [], isFocusPending: false, focusFailure: undefined, comments: [],
  review: undefined, history: undefined, outside: undefined, historyFailure: undefined, askFailure: undefined,
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
  const line = `title: ${JSON.stringify(title)}`
  const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (!head) return `---\n${line}\n---\n\n${source}`
  const body = /^title:.*$/m.test(head[1]!) ? head[1]!.replace(/^title:.*$/m, line) : `${line}\n${head[1]}`
  return `---\n${body}\n---\n${source.slice(head[0].length)}`
}

/**
 * The state of the workbench and its actions: the documents, the open document's preview, what the author points at
 * in it, its edits in place and its comments; its diagnostics and its history are parts of their own
 * (`diagnostics.ts`, `history.ts`).
 */
export class Workbench {
  readonly client: WorkspaceClient
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #diagnostics: DocumentDiagnostics
  readonly #history: DocumentHistory
  readonly #comments = new CommentStore()
  readonly #askers = new Set<(request: AgentRequest) => Promise<AgentAnswer | void>>()
  readonly #previewSinks = new Set<PreviewSink>()
  #unsubscribeIr?: () => void
  #previewReads = 0
  #irReads = 0
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #edits: Promise<void> = Promise.resolve()
  /** A place to show that no preview could take yet (none was attached, e.g. the chat covered the document). */
  #pendingReveal?: PreviewAnchor
  /** The AI's changes to show on the document once the preview has them. */
  #pendingFlash?: ReviewChange[]
  #lastPosition?: string
  /** What the author does, for the operator's collector when the host has one. */
  readonly telemetry: OperationLog

  constructor(options: { client?: WorkspaceClient, locale?: Locale, isDark?: boolean } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language),
      isDark: options.isDark ?? false,
      mode: 'editing',
      previewRenderer: 'web',
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
    this.#stopSubscriptions()
    this.#history.subscribeReview(dir)
    this.#set({ ...DOCUMENT_RESET, document: dir, previewRenderer: 'web' })
    this.#record('document.open')
    this.#diagnostics.subscribe(dir)
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
    if (this.#state.document !== undefined) this.#record('document.close')
    this.#stopSubscriptions()
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
      const preview = await this.client.readPreview(dir, renderer)
      if (current()) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (current()) this.#set({ previewFailure: errorMessage(error) })
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
    if (target) this.#record('edit.start', { 'presmium.section': target.section, 'presmium.block': target.block })
    else if (this.#state.editing) this.#record('edit.cancel', { 'presmium.section': this.#state.editing.section, 'presmium.block': this.#state.editing.block })
    if (target) {
      this.#set({ pointer: undefined, editFallback: undefined })
      this.#broadcast({ type: 'highlight', target: null })
    }
    this.#broadcast({ type: 'edit', target, ...at ? { at } : {} })
  }

  #sourceOf(target: PreviewAnchor, doc: IRDocument): { file: string, line: number, endLine?: number } | undefined {
    if (!target.block) {
      const section = doc.sections.find(s => s.id === target.section)
      return section && { file: section.source.file, line: section.source.line }
    }
    return findPlaceSource(doc, target.section, target.block)?.source
  }

  #saveEdit(target: PreviewAnchor, before: string, after: string): void {
    const document = this.#state.document
    const doc = this.#state.ir?.doc
    if (document === undefined || !doc) return
    const source = this.#sourceOf(target, doc)
    const title = doc.sections.find(s => s.id === target.section)?.title ?? ''
    const started = Date.now()
    const saved = (outcome: string, error?: string) => this.#record('edit.save', { 'presmium.section': target.section, 'presmium.block': target.block, 'presmium.before': before, 'presmium.after': after, 'presmium.outcome': outcome, 'presmium.error': error, 'presmium.ms': Date.now() - started })
    this.#set({ save: { kind: 'saving' }, editFallback: undefined })
    this.#edits = this.#edits.then(async () => {
      const fallBack = () => {
        saved('fallback')
        this.#set({ save: { kind: 'idle' }, editFallback: { target, before, after } })
        this.#reloadPreview()
      }
      if (!source) return fallBack()
      try {
        for (let attempt = 0; ; attempt++) {
          const current = await this.client.readSource(WORKSPACE_SCOPE, source.file)
          const edited = applyRenderedEdit(current.content, source, before, after)
          if (!edited.ok) return fallBack()
          try {
            await this.client.saveSource(WORKSPACE_SCOPE, source.file, edited.content, current.version, this.#messages.editedSection(title))
            break
          } catch (error) {
            // Changed on disk between the read and the save: read it again once.
            if (attempt > 0 || !(error instanceof WorkspaceServerError && error.answer.conflict)) throw error
          }
        }
        saved('saved')
        if (this.#state.document === document) {
          this.#set({ save: { kind: 'saved', at: new Date().toISOString() } })
          void this.#history.read(document)
        }
      } catch (error) {
        const locked = error instanceof WorkspaceServerError && error.answer.locked
        saved(locked ? 'locked' : 'failed', errorMessage(error))
        if (this.#state.document !== document) return
        this.#set({ save: locked ? { kind: 'locked' } : { kind: 'failed', message: errorMessage(error) } })
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

  undo(): Promise<boolean> {
    return this.#timed('history.undo', {}, () => this.#history.undo(), done => (done ? 'done' : 'refused'))
  }

  redo(): Promise<boolean> {
    return this.#timed('history.redo', {}, () => this.#history.redo(), done => (done ? 'done' : 'refused'))
  }

  revertRevision(id: string): Promise<boolean> {
    return this.#timed('history.revert', { 'presmium.revision': id }, () => this.#history.revert(id), done => (done ? 'done' : 'refused'))
  }

  acceptReview(): Promise<boolean> {
    return this.#timed('review.accept', {}, () => this.#history.acceptReview(), done => (done ? 'done' : 'refused'))
  }

  rejectReview(): Promise<boolean> {
    return this.#timed('review.reject', {}, () => this.#history.rejectReview(), done => (done ? 'done' : 'refused'))
  }

  recordOutsideChanges(): Promise<boolean> {
    return this.#timed('changes.record', {}, () => this.#history.recordOutside(this.#messages.outsideChange), done => (done ? 'done' : 'refused'))
  }

  attachPreview(sink: PreviewSink): () => void {
    this.#previewSinks.add(sink)
    sink.send({ type: 'appearance', dark: this.#state.isDark })
    sink.send({ type: 'pick', on: this.#state.mode === 'editing' })
    const reveal = this.#pendingReveal
    this.#pendingReveal = undefined
    if (reveal) sink.send({ type: 'go', section: reveal.section })
    sink.send({ type: 'highlight', target: reveal ?? this.#state.pointer?.target ?? null })
    sink.send({ type: 'pins', targets: commentPins(this.#state.comments) })
    return () => this.#previewSinks.delete(sink)
  }

  handlePreviewReport(document: string, renderer: PreviewRenderer, report: PreviewReport): void {
    if (document !== this.#state.document || renderer !== this.#state.previewRenderer) return
    switch (report.type) {
      case 'ready':
      case 'updated':
        this.#set({ previewIrRevision: report.revision })
        this.#flashChanges()
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
          this.point({ target, quote: selected.text.trim(), ...selected.rect ? { rect: selected.rect } : {}, isEditable: this.isEditable(target) })
        } else if (this.#state.pointer?.quote) this.point(undefined)
        break
      }
      case 'rect':
        if (this.#state.pointer) this.#set({ pointer: { ...this.#state.pointer, rect: report.rect ?? undefined } })
        break
      case 'editing':
        this.#set({ editing: report.active ? report.target : undefined })
        break
      case 'edited':
        this.#saveEdit(report.target, report.before, report.after)
        break
      case 'position': {
        // Where the author reads or presents: recorded when it moves to another section, step or view.
        const at = `${report.section}\0${report.step}\0${report.view ?? ''}`
        if (at === this.#lastPosition) break
        this.#lastPosition = at
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
    this.#focusVersion++
    this.#pendingReveal = undefined
    this.#pendingFlash = undefined
    this.#unsubscribeIr?.()
    this.#unsubscribeIr = undefined
    this.#history.stop()
    this.#diagnostics.stop()
  }

  dispose(): void {
    this.telemetry.stop()
    this.#stopSubscriptions()
    this.#diagnostics.dispose()
  }
}
