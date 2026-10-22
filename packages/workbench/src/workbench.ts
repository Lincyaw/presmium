import { errorMessage, stepKeys, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, DocumentOperation, DocumentsAnswer, FilesAnswer, Finding, FocusReport, HistoryRevision, IrAnswer, IrEvent, OperationAnswer, PreviewAnchor, PreviewAnswer, PreviewCommand, PreviewDiagnostics, PreviewRenderer, PreviewReport, PreviewShortcut, ReviewSnapshot, SourceAnswer, UncommittedFile } from '@lincyaw/kernel'
import { DocumentChanges } from './changes.ts'
import { DocumentDiagnostics } from './diagnostics.ts'
import { mergeTexts } from './merge.ts'
import type { MergeLabels } from './merge.ts'
import { localeOf } from './messages.ts'
import type { Locale } from './messages.ts'
import { findPlaceAtLine, findPlaceSource } from './places.ts'
import { workspaceClient, WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'

export type DocumentLayout = 'preview' | 'split' | 'source'

export type FileNotice =
  | { kind: 'changed', version: string, content: string }
  | { kind: 'merged', conflicts: number }
  | { kind: 'locked', holder: string }
  | { kind: 'failed', message: string }

export interface OpenFile {
  path: string
  base: string
  version: string
  isDirty: boolean
  notice?: FileNotice
}

export interface Reveal {
  path: string
  line: number
  endLine?: number
  highlight?: boolean
  sequence: number
}

type RevealAt = Omit<Reveal, 'path' | 'sequence'>

export interface WorkbenchState {
  locale: Locale
  isDark: boolean
  documents?: DocumentsAnswer
  documentsFailure?: string
  /** The workspace's routes answer 404: `@lincyaw/dsh` is turned off on the plugins page. */
  isBundleDisabled?: boolean
  document?: string
  files?: FilesAnswer
  ir?: IrAnswer
  openFiles: OpenFile[]
  activeFile?: string
  openFailure?: string
  cursorLine: number
  reveal?: Reveal
  previewRenderer: PreviewRenderer
  previewTabs: PreviewRenderer[]
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
  isPicking: boolean
  layout: DocumentLayout
  focus: FocusReport[]
  isFocusPending: boolean
  focusFailure?: string
  /** The unsaved files that leaving the document or a file would drop: the author saves, discards or stays. */
  unsavedOnLeave?: string[]
  isSavingOnLeave: boolean
  hasSaveOnLeaveFailed: boolean
  review?: ReviewSnapshot
  uncommitted?: UncommittedFile[]
  revisions?: HistoryRevision[]
  changesFailure?: string
}

export interface EditorBridge {
  text(path: string): string | undefined
  replace(path: string, text: string, fresh: boolean): void
  focus?(): void
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

/**
 * The document of the workspace's own routes: their paths are relative to the workspace root. The file tree and the
 * editor always use it; opened as a document in a workspace of several documents, it is the workspace root with no
 * lecture selected.
 */
export const WORKSPACE_SCOPE = ''

export function isWorkspaceRootOpen(state: WorkbenchState): boolean {
  return state.document === WORKSPACE_SCOPE && state.documents?.single === false
}

/** The lecture the conversation works on: none when no document or the workspace root is open. */
export function selectedDocument(state: WorkbenchState): string | null {
  return isWorkspaceRootOpen(state) ? null : state.document ?? null
}

/** What opening or closing a document clears. */
const DOCUMENT_RESET = {
  files: undefined, ir: undefined, openFiles: [], activeFile: undefined, reveal: undefined, preview: undefined, previewIrRevision: undefined,
  diagnostics: undefined, isDiagnosticsUnavailable: false, isRepairingDiagnostics: false, diagnosticsRepairFailure: undefined,
  focus: [], isFocusPending: false, focusFailure: undefined,
  review: undefined, uncommitted: undefined, revisions: undefined, changesFailure: undefined,
} satisfies Partial<WorkbenchState>

/**
 * The state of the workbench and its actions: the documents, the open document's files and editor, its preview and
 * focus; its diagnostics and its changes are parts of their own (`diagnostics.ts`, `changes.ts`).
 */
export class Workbench {
  readonly client: WorkspaceClient
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #shortcutListeners = new Set<(command: PreviewShortcut) => void>()
  readonly #diagnostics: DocumentDiagnostics
  readonly #changes: DocumentChanges
  #editor?: EditorBridge
  readonly #previewSinks = new Set<PreviewSink>()
  readonly #savingPaths = new Set<string>()
  #unsubscribeIr?: () => void
  #previewReads = 0
  #irReads = 0
  #revealSequence = 0
  #highlightTimer?: ReturnType<typeof setTimeout>
  #highlight: PreviewAnchor | null = null
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #pendingLeave?: () => void | Promise<void>

  constructor(options: { client?: WorkspaceClient, locale?: Locale, isDark?: boolean } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language),
      isDark: options.isDark ?? false,
      openFiles: [],
      cursorLine: 1,
      previewRenderer: 'web',
      previewTabs: ['web'],
      previewReload: 0,
      isDiagnosticsUnavailable: false,
      canRepairDiagnostics: false,
      isRepairingDiagnostics: false,
      isPicking: false,
      layout: 'preview',
      focus: [],
      isFocusPending: false,
      isSavingOnLeave: false,
      hasSaveOnLeaveFailed: false,
    }
    const workbench = this
    const store: WorkbenchStore = {
      get state() {
        return workbench.#state
      },
      set: patch => workbench.#set(patch),
    }
    this.#diagnostics = new DocumentDiagnostics(this.client, store)
    this.#changes = new DocumentChanges(this.client, store, dir => this.#readStatus(dir))
  }

  get state(): WorkbenchState {
    return this.#state
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  subscribePreviewShortcuts = (listener: (command: PreviewShortcut) => void): (() => void) => {
    this.#shortcutListeners.add(listener)
    return () => this.#shortcutListeners.delete(listener)
  }

  onRepairDiagnostics = (repairer: (diagnostics: readonly Diagnostic[]) => void | Promise<void>): (() => void) => this.#diagnostics.onRepair(repairer)

  requestRepairDiagnostics(): Promise<void> {
    return this.#diagnostics.requestRepair()
  }

  getState = (): WorkbenchState => this.#state

  #set(patch: Partial<WorkbenchState>): void {
    this.#state = { ...this.#state, ...patch }
    for (const listener of this.#listeners) listener()
  }

  #findOpenFile(path: string | undefined): OpenFile | undefined {
    return this.#state.openFiles.find(file => file.path === path)
  }

  #updateOpenFile(path: string, patch: Partial<OpenFile>): void {
    this.#set({ openFiles: this.#state.openFiles.map(file => (file.path === path ? { ...file, ...patch } : file)) })
  }

  setLocale(locale: Locale): void {
    if (locale !== this.#state.locale) this.#set({ locale })
  }

  setDark(isDark: boolean): void {
    if (isDark === this.#state.isDark) return
    this.#set({ isDark })
    this.#broadcast({ type: 'appearance', dark: isDark })
  }

  async loadDocuments(): Promise<void> {
    try {
      this.#set({ documents: await this.client.readDocuments(), documentsFailure: undefined, isBundleDisabled: false })
    } catch (error) {
      this.#set({ documentsFailure: errorMessage(error), isBundleDisabled: error instanceof WorkspaceServerError && error.status === 404 })
    }
  }

  async operateDocument(operation: DocumentOperation): Promise<OperationAnswer> {
    const answer = await this.client.operateDocument(operation)
    if (operation.op !== 'create' && operation.op !== 'copy' && this.#state.document === operation.dir) this.closeDocument()
    await this.loadDocuments()
    return answer
  }

  async openDocument(dir: string): Promise<void> {
    if (this.#state.document === dir) return
    if (this.#deferLeave(this.#state.openFiles, () => this.#openDocument(dir))) return
    await this.#openDocument(dir)
  }

  async #openDocument(dir: string): Promise<void> {
    this.#stopSubscriptions()
    this.#changes.subscribeReview(dir)
    this.#set({ ...DOCUMENT_RESET, document: dir, previewRenderer: 'web', previewTabs: ['web'], layout: 'preview', cursorLine: 1, previewFailure: undefined })
    this.#diagnostics.subscribe(dir)
    if (isWorkspaceRootOpen(this.#state)) {
      this.#unsubscribeIr = undefined
      this.#set({ layout: 'source' })
      await Promise.all([this.#readFiles(dir), this.#readStatus(dir), this.#changes.read(dir)])
      return
    }
    this.#unsubscribeIr = this.client.subscribeIr(dir, event => void this.#handleIrEvent(dir, event), () => void this.#readIr(dir))
    await Promise.all([this.#readFiles(dir), this.#readIr(dir), this.#readPreview(dir), this.#readStatus(dir), this.#readFocus(dir), this.#changes.read(dir)])
  }

  closeDocument(): void {
    if (this.#deferLeave(this.#state.openFiles, () => this.#closeDocument())) return
    this.#closeDocument()
  }

  #closeDocument(): void {
    this.#stopSubscriptions()
    this.#set({ ...DOCUMENT_RESET, document: undefined })
    void this.loadDocuments()
  }

  async #readFiles(dir: string): Promise<void> {
    try {
      const files = await this.client.readFiles(WORKSPACE_SCOPE)
      if (this.#state.document === dir) this.#set({ files })
    } catch {
    }
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
      if (this.#state.document === dir && read === this.#irReads) this.#set({ ir })
    } catch {
    }
  }

  retryDiagnostics(): void {
    this.#diagnostics.retry()
  }

  reportPreviewDiagnostics(report: PreviewDiagnostics): Promise<void> {
    return this.#diagnostics.reportPreview(report)
  }

  async #readStatus(dir: string): Promise<void> {
    try {
      const documents = await this.client.readDocuments(dir)
      if (this.#state.document === dir) this.#set({ documents: { ...documents, documents: this.#state.documents?.documents ?? documents.documents } })
    } catch {
    }
  }

  acceptReview(message?: string): Promise<boolean> {
    return this.#changes.acceptReview(message)
  }

  rejectReview(paths?: string[]): Promise<boolean> {
    return this.#changes.rejectReview(paths)
  }

  restoreReview(step: string): Promise<boolean> {
    return this.#changes.restoreReview(step)
  }

  commitChanges(message: string): Promise<boolean> {
    return this.#changes.commit(message)
  }

  discardChanges(): Promise<boolean> {
    return this.#changes.discard()
  }

  revertRevision(id: string): Promise<boolean> {
    return this.#changes.revertRevision(id)
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
    if (renderers && JSON.stringify(renderers) !== JSON.stringify(this.#state.ir?.doc.config.renderers)) void this.#readPreview(dir)
    const changed = this.#state.openFiles.filter(file => event.files.includes(file.path)).map(file => file.path)
    if (changed.length > 0) await this.checkDisk(changed)
    if (event.files.length > 0) {
      void this.#readStatus(dir)
      void this.#changes.read(dir)
    }
    if (event.files.some(file => !this.#state.files?.files.some(listed => listed.path === file))) void this.#readFiles(dir)
  }

  bindEditor(editor: EditorBridge): () => void {
    this.#editor = editor
    return () => {
      if (this.#editor === editor) this.#editor = undefined
    }
  }

  textOf(path: string): string | undefined {
    const file = this.#findOpenFile(path)
    return file && (this.#editor?.text(path) ?? file.base)
  }

  /** Opens a file of the workspace in the open document's editor. */
  async openFile(path: string, at?: RevealAt): Promise<boolean> {
    const document = this.#state.document
    if (document === undefined) return false
    if (!this.#findOpenFile(path)) {
      let answer: SourceAnswer
      try {
        // Files belong to the opened workspace; the selected document owns only its preview and context.
        answer = await this.client.readSource(WORKSPACE_SCOPE, path)
      } catch (error) {
        this.#set({ openFailure: errorMessage(error) })
        return false
      }
      if (document !== this.#state.document) return false
      if (!this.#findOpenFile(path)) this.#set({ openFiles: [...this.#state.openFiles, { path, base: answer.content, version: answer.version, isDirty: false }] })
    }
    this.#set({ activeFile: path, openFailure: undefined, ...this.#state.layout !== 'split' ? { layout: 'source' as const } : {}, ...at ? { reveal: { path, ...at, sequence: ++this.#revealSequence } } : {} })
    return true
  }

  async createFile(path: string): Promise<void> {
    const document = this.#state.document
    if (document === undefined) return
    await this.client.createSource(WORKSPACE_SCOPE, path)
    if (this.#state.document !== document) return
    await this.#readFiles(document)
    await this.openFile(path)
    void this.#readStatus(document)
    void this.#changes.read(document)
  }

  /**
   * Opens a file of the workspace from elsewhere (a link, Quick Open) and focuses the editor: in `document` when it is
   * given (leaving the open one, which guards unsaved files first), else in the open document or the workspace root.
   * A file already open is checked against the disk first; without a line it keeps its cursor.
   */
  async openWorkspaceFile(path: string, options: { document?: string } & Partial<RevealAt> = {}): Promise<void> {
    const { document, ...at } = options
    const destination = document ?? this.#state.document ?? WORKSPACE_SCOPE
    const open = async () => {
      if (destination !== this.#state.document) await this.#openDocument(destination)
      if (destination !== this.#state.document) return
      if (this.#findOpenFile(path)) await this.checkDisk([path])
      await this.openFile(path, at.line === undefined ? { line: this.#state.activeFile === path ? this.#state.cursorLine : 1 } : { ...at, line: at.line })
      this.#editor?.focus?.()
    }
    if (destination !== this.#state.document && this.#deferLeave(this.#state.openFiles, open)) return
    await open()
  }

  closeFile(path: string): void {
    if (this.#deferLeave(this.#state.openFiles.filter(file => file.path === path), () => this.#closeFile(path))) return
    this.#closeFile(path)
  }

  #closeFile(path: string): void {
    const index = this.#state.openFiles.findIndex(file => file.path === path)
    if (index < 0) return
    const openFiles = this.#state.openFiles.filter(file => file.path !== path)
    this.#set({ openFiles, ...this.#state.activeFile === path ? { activeFile: openFiles[Math.min(index, openFiles.length - 1)]?.path } : {}, ...!openFiles.length && this.#state.previewTabs.length ? { layout: 'preview' as const } : {} })
  }

  #deferLeave(files: OpenFile[], leave: () => void | Promise<void>): boolean {
    const dirty = files.filter(file => file.isDirty).map(file => file.path)
    if (!dirty.length) return false
    this.#pendingLeave = leave
    this.#set({ unsavedOnLeave: dirty, isSavingOnLeave: false, hasSaveOnLeaveFailed: false })
    return true
  }

  async resolveLeave(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
    if (this.#state.isSavingOnLeave) return
    const leave = this.#pendingLeave
    if (choice === 'save') {
      this.#set({ isSavingOnLeave: true, hasSaveOnLeaveFailed: false })
      for (const path of this.#state.unsavedOnLeave ?? []) await this.save(path)
      if (this.#state.unsavedOnLeave?.some(path => this.#findOpenFile(path)?.isDirty)) {
        this.#set({ isSavingOnLeave: false, hasSaveOnLeaveFailed: true })
        return
      }
    }
    this.#pendingLeave = undefined
    this.#set({ unsavedOnLeave: undefined, isSavingOnLeave: false, hasSaveOnLeaveFailed: false })
    if (choice !== 'cancel') await leave?.()
  }

  showFile(path: string): void {
    if (this.#findOpenFile(path)) this.#set({ activeFile: path, ...this.#state.layout !== 'split' ? { layout: 'source' as const } : {} })
  }

  /** The editor's text of an open file changed: it is dirty while it differs from the file's text on disk. */
  recordEdit(path: string, text: string): void {
    const file = this.#findOpenFile(path)
    if (file && file.isDirty !== (text !== file.base)) this.#updateOpenFile(path, { isDirty: text !== file.base })
  }

  async save(path = this.#state.activeFile): Promise<void> {
    const file = this.#findOpenFile(path)
    const document = this.#state.document
    if (!file || document === undefined || this.#savingPaths.has(file.path)) return
    const text = this.textOf(file.path) ?? file.base
    this.#savingPaths.add(file.path)
    try {
      const { version } = await this.client.saveSource(WORKSPACE_SCOPE, file.path, text, file.version)
      this.#updateOpenFile(file.path, { base: text, version, isDirty: this.textOf(file.path) !== text, notice: undefined })
      void this.#readStatus(document)
    } catch (error) {
      const answer = error instanceof WorkspaceServerError ? error.answer : undefined
      if (answer?.locked) this.#updateOpenFile(file.path, { notice: { kind: 'locked', holder: answer.locked.holder } })
      else if (answer?.conflict) this.#updateOpenFile(file.path, { notice: { kind: 'changed', ...answer.conflict } })
      else this.#updateOpenFile(file.path, { notice: { kind: 'failed', message: errorMessage(error) } })
    } finally {
      this.#savingPaths.delete(file.path)
    }
  }

  reload(path: string): void {
    const file = this.#findOpenFile(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    this.#updateOpenFile(path, { base: content, version, isDirty: false, notice: undefined })
    this.#editor?.replace(path, content, true)
    this.#editor?.focus?.()
  }

  merge(path: string, labels: MergeLabels): void {
    const file = this.#findOpenFile(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    const merged = mergeTexts(this.textOf(path) ?? file.base, file.base, content, labels)
    this.#updateOpenFile(path, { base: content, version, notice: { kind: 'merged', conflicts: merged.conflicts }, isDirty: merged.text !== content })
    this.#editor?.replace(path, merged.text, false)
    this.#editor?.focus?.()
  }

  async checkDisk(paths = this.#state.openFiles.map(file => file.path)): Promise<void> {
    const document = this.#state.document
    if (document === undefined) return
    for (const path of paths) {
      const file = this.#findOpenFile(path)
      if (!file || this.#savingPaths.has(path)) continue
      const known = file.version
      let answer: SourceAnswer
      try {
        answer = await this.client.readSource(WORKSPACE_SCOPE, path)
      } catch {
        continue
      }
      const now = this.#findOpenFile(path)
      if (!now || answer.version === now.version || now.version !== known || this.#savingPaths.has(path)) continue
      if (!now.isDirty) {
        this.#updateOpenFile(path, { base: answer.content, version: answer.version, notice: undefined })
        this.#editor?.replace(path, answer.content, true)
      } else if (now.notice?.kind !== 'locked' && (now.notice?.kind !== 'changed' || now.notice.version !== answer.version)) {
        this.#updateOpenFile(path, { notice: { kind: 'changed', version: answer.version, content: answer.content } })
      }
    }
  }

  /** The editor's cursor moved to `line`: the preview highlights the section or block there, 150 ms later. */
  syncCursorLine(line: number): void {
    if (line !== this.#state.cursorLine) this.#set({ cursorLine: line })
    clearTimeout(this.#highlightTimer)
    this.#highlightTimer = setTimeout(() => {
      const doc = this.#state.ir?.doc
      const path = this.#state.activeFile
      if (!doc || !path) return
      const place = findPlaceAtLine(doc, path, line)
      this.#highlight = place ? { section: place.section, ...place.block ? { block: place.block } : {} } : null
      this.#broadcast({ type: 'highlight', target: this.#highlight })
    }, 150)
  }

  async revealPlace(section: string, block?: string): Promise<void> {
    const doc = this.#state.ir?.doc
    const place = doc && findPlaceSource(doc, section, block)
    if (!place) return
    await this.openFile(place.source.file, { line: place.source.line, ...place.source.endLine ? { endLine: place.source.endLine } : {}, highlight: true })
  }

  async revealProblem(finding: Finding): Promise<void> {
    if (!finding.source?.file) return
    await this.openFile(finding.source.file, { line: finding.source.line ?? 1 })
  }

  setPreviewRenderer(renderer: PreviewRenderer): void {
    if (renderer === this.#state.previewRenderer) return
    this.#set({ previewRenderer: renderer, preview: undefined, previewFailure: undefined, previewIrRevision: undefined })
    const document = this.#state.document
    if (document !== undefined && !isWorkspaceRootOpen(this.#state)) void this.#readPreview(document)
  }

  setLayout(layout: DocumentLayout): void {
    if (layout !== 'source' && !this.#state.previewTabs.length) this.#set({ previewTabs: [this.#state.previewRenderer] })
    this.#set({ layout })
  }

  openPreview(renderer: PreviewRenderer = this.#state.previewRenderer, beside = false): void {
    if (!this.#state.previewTabs.includes(renderer)) this.#set({ previewTabs: [...this.#state.previewTabs, renderer] })
    this.setPreviewRenderer(renderer)
    this.setLayout(beside && this.#state.openFiles.length ? 'split' : 'preview')
  }

  closePreview(renderer: PreviewRenderer): void {
    const tabs = this.#state.previewTabs.filter(tab => tab !== renderer)
    this.#set({ previewTabs: tabs, ...!tabs.length ? { layout: 'source' as const } : {} })
    if (tabs.length && this.#state.previewRenderer === renderer) this.setPreviewRenderer(tabs[tabs.length - 1]!)
  }

  reloadPreview(): void {
    this.#set({ previewReload: this.#state.previewReload + 1 })
    const address = this.#state.previewRenderer === 'slides' ? this.#state.preview?.slides : this.#state.preview?.web
    if (!address) this.retryPreview()
  }

  /** Makes the editor's selection the conversation's focus. */
  focusSourceSelection(selection: { startLine: number, endLine: number, text: string }): void {
    const { activeFile, document } = this.#state
    if (!activeFile || document === undefined || isWorkspaceRootOpen(this.#state)) return
    const prefix = document ? `${document}/` : ''
    const outside = Boolean(prefix && !activeFile.startsWith(prefix))
    this.setFocus([{ id: 'selection', from: 'source', ...outside ? { scope: 'workspace' as const } : {}, source: { file: outside ? activeFile : activeFile.slice(prefix.length), startLine: selection.startLine, endLine: selection.endLine }, quote: selection.text.slice(0, 2000) }])
  }

  setFocus(focus: FocusReport[]): void {
    const document = this.#state.document
    if (document === undefined) return
    const version = ++this.#focusVersion
    this.#set({ focus, isFocusPending: true, focusFailure: undefined })
    this.#broadcast({ type: 'pins', targets: focus.flatMap(item => item.section && item.block ? [{ id: item.id, section: item.section, block: item.block, label: '1' }] : []) })
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

  setPicking(isPicking: boolean): void {
    this.#set({ isPicking })
    this.#broadcast({ type: 'pick', on: isPicking })
  }

  attachPreview(sink: PreviewSink): () => void {
    this.#previewSinks.add(sink)
    sink.send({ type: 'appearance', dark: this.#state.isDark })
    sink.send({ type: 'pick', on: this.#state.isPicking })
    sink.send({ type: 'highlight', target: this.#highlight })
    return () => this.#previewSinks.delete(sink)
  }

  handlePreviewReport(document: string, renderer: PreviewRenderer, report: PreviewReport): void {
    if (document !== this.#state.document || renderer !== this.#state.previewRenderer) return
    switch (report.type) {
      case 'ready':
        this.#set({ previewIrRevision: report.revision })
        break
      case 'updated':
        this.#set({ previewIrRevision: report.revision })
        break
      case 'picked':
        {
          const section = this.#state.ir?.doc.sections.find(section => section.id === report.section)
          const step = section && report.trail ? trailStep(stepKeys(section), report.trail) : report.step
          this.setFocus([{ id: 'selection', from: renderer, section: report.section, ...report.block ? { block: report.block } : {}, ...step === undefined ? {} : { step } }])
          if (this.#state.layout !== 'preview') void this.revealPlace(report.section, report.block)
        }
        break
      case 'selection':
        if (report.selection?.text.trim()) this.setFocus([{ id: 'selection', from: renderer, section: report.selection.section, ...report.selection.block ? { block: report.selection.block } : {}, quote: report.selection.text.slice(0, 2000) }])
        break
      case 'shortcut':
        for (const listener of this.#shortcutListeners) listener(report.command)
        break
      default:
        break
    }
  }

  retryPreview(): void {
    if (this.#state.document !== undefined) void this.#readPreview(this.#state.document)
  }

  #broadcast(command: PreviewCommand): void {
    for (const sink of this.#previewSinks) sink.send(command)
  }

  #stopSubscriptions(): void {
    this.#focusVersion++
    this.#unsubscribeIr?.()
    this.#unsubscribeIr = undefined
    this.#changes.stop()
    this.#diagnostics.stop()
  }

  dispose(): void {
    this.#stopSubscriptions()
    this.#shortcutListeners.clear()
    this.#diagnostics.dispose()
    clearTimeout(this.#highlightTimer)
  }
}
