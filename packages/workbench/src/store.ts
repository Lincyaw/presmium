import { stepKeys, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, Finding, FocusReport, PreviewAnchor, PreviewCommand, PreviewDiagnostics, PreviewReport, PreviewShortcut } from '@lincyaw/kernel'
import type { DocumentOperation, DocumentsAnswer, FilesAnswer, HistoryRevision, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, PreviewRenderer, ReviewUpdate, ReviewSnapshot, SourceAnswer, UncommittedFile } from './api.ts'
import { mergeTexts } from './merge.ts'
import type { MergeLabels } from './merge.ts'
import { placeAt, placeOf } from './places.ts'
import { ServiceError, workspaceClient } from './service.ts'
import type { WorkspaceClient } from './service.ts'

export type Locale = 'zh-CN' | 'en'

export type { PreviewRenderer } from './api.ts'
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
  dirty: boolean
  notice?: FileNotice
}

export interface Reveal {
  path: string
  line: number
  endLine?: number
  mark?: boolean
  seq: number
}

export interface PageIssue {
  level: 'error' | 'warning'
  plugin?: string
  message: string
}

export interface WorkbenchState {
  locale: Locale
  dark: boolean
  documents?: DocumentsAnswer
  failure?: string
  noRoutes?: boolean
  document?: string
  files?: FilesAnswer
  ir?: IrAnswer
  open: OpenFile[]
  active?: string
  openFailure?: string
  line: number
  reveal?: Reveal
  view: PreviewRenderer
  previewTabs: PreviewRenderer[]
  previewReload: number
  preview?: PreviewAnswer
  previewFailure?: string
  shown?: string
  diagnostics?: DiagnosticSnapshot
  diagnosticsUnavailable: boolean
  canRepairDiagnostics: boolean
  diagnosticsRepairing: boolean
  diagnosticsRepairFailure?: string
  picking: boolean
  layout: DocumentLayout
  focus: FocusReport[]
  focusPending: boolean
  focusFailure?: string
  leaving?: string[]
  leaveSaving: boolean
  leaveFailed: boolean
  review?: ReviewSnapshot
  changed?: UncommittedFile[]
  history?: HistoryRevision[]
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

export function localeOf(tag: string | undefined): Locale {
  return tag?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export class Workbench {
  readonly client: WorkspaceClient
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #commands = new Set<(command: PreviewShortcut) => void>()
  readonly #repairDiagnostics = new Set<(diagnostics: readonly Diagnostic[]) => void | Promise<void>>()
  #editor?: EditorBridge
  readonly #previews = new Set<PreviewSink>()
  readonly #saving = new Set<string>()
  #stopEvents?: () => void
  #stopReview?: () => void
  #stopDiagnostics?: () => void
  #diagnosticsScope = 0
  #repairRequest = 0
  #changeReads = 0
  #previewReads = 0
  #irReads = 0
  #revealed = 0
  #highlightTimer?: ReturnType<typeof setTimeout>
  #highlight: PreviewAnchor | null = null
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #previewWriting: Promise<void> = Promise.resolve()
  #leave?: () => void | Promise<void>

  constructor(options: { client?: WorkspaceClient, locale?: Locale, dark?: boolean } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language),
      dark: options.dark ?? false,
      open: [],
      line: 1,
      view: 'web',
      previewTabs: ['web'],
      previewReload: 0,
      diagnosticsUnavailable: false,
      canRepairDiagnostics: false,
      diagnosticsRepairing: false,
      picking: false,
      layout: 'preview',
      focus: [],
      focusPending: false,
      leaveSaving: false,
      leaveFailed: false,
    }
  }

  get state(): WorkbenchState {
    return this.#state
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  subscribeCommands = (listener: (command: PreviewShortcut) => void): (() => void) => {
    this.#commands.add(listener)
    return () => this.#commands.delete(listener)
  }

  onRepairDiagnostics = (listener: (diagnostics: readonly Diagnostic[]) => void | Promise<void>): (() => void) => {
    this.#repairDiagnostics.add(listener)
    this.#set({ canRepairDiagnostics: true })
    return () => {
      this.#repairDiagnostics.delete(listener)
      this.#set({ canRepairDiagnostics: this.#repairDiagnostics.size > 0 })
    }
  }

  async requestRepairDiagnostics(): Promise<void> {
    const diagnostics = this.#state.diagnostics?.diagnostics
    if (!diagnostics?.length || this.#repairDiagnostics.size === 0 || this.#state.diagnosticsRepairing || this.#state.diagnosticsUnavailable) return
    const request = ++this.#repairRequest
    this.#set({ diagnosticsRepairing: true, diagnosticsRepairFailure: undefined })
    try {
      await Promise.all([...this.#repairDiagnostics].map(listener => listener(diagnostics)))
    } catch (error) {
      if (request === this.#repairRequest) this.#set({ diagnosticsRepairFailure: message(error) })
    } finally {
      if (request === this.#repairRequest) this.#set({ diagnosticsRepairing: false })
    }
  }

  getState = (): WorkbenchState => this.#state

  #set(patch: Partial<WorkbenchState>): void {
    this.#state = { ...this.#state, ...patch }
    for (const listener of this.#listeners) listener()
  }

  #file(path: string | undefined): OpenFile | undefined {
    return this.#state.open.find(file => file.path === path)
  }

  #update(path: string, patch: Partial<OpenFile>): void {
    this.#set({ open: this.#state.open.map(file => (file.path === path ? { ...file, ...patch } : file)) })
  }

  setLocale(locale: Locale): void {
    if (locale !== this.#state.locale) this.#set({ locale })
  }

  setDark(dark: boolean): void {
    if (dark === this.#state.dark) return
    this.#set({ dark })
    this.#broadcast({ type: 'appearance', dark })
  }

  async loadDocuments(): Promise<void> {
    try {
      this.#set({ documents: await this.client.documents(), failure: undefined, noRoutes: false })
    } catch (error) {
      this.#set({ failure: message(error), noRoutes: error instanceof ServiceError && error.status === 404 })
    }
  }

  async operate(operation: DocumentOperation): Promise<OperationAnswer> {
    const answer = await this.client.operate(operation)
    if (operation.op !== 'create' && operation.op !== 'copy' && this.#state.document === operation.dir) this.closeDocument()
    await this.loadDocuments()
    return answer
  }

  async openDocument(dir: string): Promise<void> {
    if (this.#state.document === dir) return
    if (this.#deferLeave(this.#state.open, () => this.#openDocument(dir))) return
    await this.#openDocument(dir)
  }

  async #openDocument(dir: string): Promise<void> {
    this.#stop()
    this.#stopReview = this.client.review(dir, event => this.#reviewed(dir, event))
    this.#set({ document: dir, view: 'web', previewTabs: ['web'], layout: 'preview', files: undefined, ir: undefined, open: [], active: undefined, line: 1, reveal: undefined, preview: undefined, previewFailure: undefined, shown: undefined, diagnostics: undefined, diagnosticsUnavailable: false, diagnosticsRepairing: false, diagnosticsRepairFailure: undefined, focus: [], focusPending: false, focusFailure: undefined, ...NO_CHANGES })
    this.#followDiagnostics(dir)
    if (dir === '' && this.#state.documents?.single === false) {
      this.#stopEvents = undefined
      this.#set({ layout: 'source' })
      await Promise.all([this.#readFiles(dir), this.#readStatus(dir), this.#readChanges(dir)])
      return
    }
    this.#stopEvents = this.client.events(dir, event => void this.#compiled(dir, event), () => void this.#readIr(dir))
    await Promise.all([this.#readFiles(dir), this.#readIr(dir), this.#readPreview(dir), this.#readStatus(dir), this.#readFocus(dir), this.#readChanges(dir)])
  }

  closeDocument(): void {
    if (this.#deferLeave(this.#state.open, () => this.#closeDocument())) return
    this.#closeDocument()
  }

  #closeDocument(): void {
    this.#stop()
    this.#set({ document: undefined, files: undefined, ir: undefined, open: [], active: undefined, reveal: undefined, preview: undefined, shown: undefined, diagnostics: undefined, diagnosticsUnavailable: false, diagnosticsRepairing: false, diagnosticsRepairFailure: undefined, focus: [], focusPending: false, focusFailure: undefined, ...NO_CHANGES })
    void this.loadDocuments()
  }

  async #readFiles(dir: string): Promise<void> {
    try {
      const files = await this.client.files('')
      if (this.#state.document === dir) this.#set({ files })
    } catch {
    }
  }

  async #readFocus(dir: string): Promise<void> {
    const version = this.#focusVersion
    try {
      const answer = await this.client.focus(dir)
      if (this.#state.document === dir && version === this.#focusVersion) this.#set({ focus: answer.focus ?? [] })
    } catch {
    }
  }

  async #readIr(dir: string): Promise<void> {
    const read = ++this.#irReads
    try {
      const ir = await this.client.ir(dir)
      if (this.#state.document === dir && read === this.#irReads) this.#set({ ir })
    } catch {
    }
  }

  #followDiagnostics(dir: string): void {
    const scope = this.#diagnosticsScope
    let streamFailed = false
    let liveReceived = false
    const current = () => scope === this.#diagnosticsScope && this.#state.document === dir
    const received = (diagnostics: DiagnosticSnapshot, live = false) => {
      if (!current() || (!live && liveReceived)) return
      if (live) {
        liveReceived = true
        streamFailed = false
      }
      this.#set({ diagnostics, diagnosticsUnavailable: streamFailed })
    }
    const failed = () => {
      streamFailed = true
      if (current() && !this.#state.diagnosticsUnavailable) this.#set({ diagnosticsUnavailable: true })
    }
    this.#stopDiagnostics = this.client.diagnosticEvents(dir, snapshot => received(snapshot, true), failed)
    void this.client.diagnostics(dir).then(snapshot => received(snapshot), () => {
      if (current() && !this.#state.diagnostics && !this.#state.diagnosticsUnavailable) this.#set({ diagnosticsUnavailable: true })
    })
  }

  retryDiagnostics(): void {
    const document = this.#state.document
    if (document === undefined) return
    this.#stopDiagnostics?.()
    this.#diagnosticsScope++
    this.#followDiagnostics(document)
  }

  reportPreviewDiagnostics(report: PreviewDiagnostics): Promise<void> {
    const scope = this.#diagnosticsScope
    this.#previewWriting = this.#previewWriting.then(async () => {
      try {
        await this.client.reportDiagnostics(report)
      } catch {
        if (scope === this.#diagnosticsScope && this.#state.document === report.document && !this.#state.diagnosticsUnavailable) this.#set({ diagnosticsUnavailable: true })
      }
    })
    return this.#previewWriting
  }

  async #readStatus(dir: string): Promise<void> {
    try {
      const documents = await this.client.documents(dir)
      if (this.#state.document === dir) this.#set({ documents: { ...documents, documents: this.#state.documents?.documents ?? documents.documents } })
    } catch {
    }
  }

  async #readChanges(dir: string): Promise<void> {
    const read = ++this.#changeReads
    try {
      const [{ files }, { revisions }] = await Promise.all([this.client.changes(dir), this.client.revisions(dir)])
      if (this.#state.document === dir && read === this.#changeReads) this.#set({ changed: files, history: revisions })
    } catch {
    }
  }

  #reviewed(dir: string, event: ReviewUpdate): void {
    if (this.#state.document !== dir) return
    this.#set({ review: event.review })
    if (event.ended) {
      void this.#readChanges(dir)
      void this.#readStatus(dir)
    }
  }

  async #act(work: (dir: string) => Promise<unknown>): Promise<boolean> {
    const dir = this.#state.document
    if (dir === undefined) return false
    try {
      await work(dir)
      this.#set({ changesFailure: undefined })
      return true
    } catch (error) {
      this.#set({ changesFailure: message(error) })
      return false
    } finally {
      void this.#readChanges(dir)
      void this.#readStatus(dir)
    }
  }

  acceptReview(message?: string): Promise<boolean> {
    return this.#act(dir => this.client.accept(dir, message ? { message } : {}))
  }

  rejectReview(paths?: string[]): Promise<boolean> {
    return this.#act(dir => this.client.reject(dir, paths))
  }

  restoreReview(step: string): Promise<boolean> {
    return this.#act(dir => this.client.restore(dir, step))
  }

  commitChanges(message: string): Promise<boolean> {
    return this.#act(dir => this.client.commit(dir, message))
  }

  discardChanges(): Promise<boolean> {
    return this.#act(dir => this.client.discard(dir))
  }

  revert(id: string): Promise<boolean> {
    return this.#act(async (dir) => {
      const answer = await this.client.revert(dir, id)
      if (!answer.ok) throw new Error(answer.conflicts.join(', '))
    })
  }

  async #readPreview(dir: string): Promise<void> {
    const read = ++this.#previewReads
    const view = this.#state.view
    const current = () => this.#state.document === dir && this.#state.view === view && read === this.#previewReads
    try {
      const preview = await this.client.preview(dir, view)
      if (current()) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (current()) this.#set({ previewFailure: message(error) })
    }
  }

  async #compiled(dir: string, event: IrEvent): Promise<void> {
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
    const changed = this.#state.open.filter(file => event.files.includes(file.path)).map(file => file.path)
    if (changed.length > 0) await this.checkDisk(changed)
    if (event.files.length > 0) {
      void this.#readStatus(dir)
      void this.#readChanges(dir)
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
    const file = this.#file(path)
    return file && (this.#editor?.text(path) ?? file.base)
  }

  async openFile(path: string, at?: Omit<Reveal, 'path' | 'seq'>): Promise<boolean> {
    const document = this.#state.document
    if (document === undefined) return false
    if (!this.#file(path)) {
      let answer: SourceAnswer
      try {
        // Files belong to the opened workspace; the selected document owns only its preview and context.
        answer = await this.client.source('', path)
      } catch (error) {
        this.#set({ openFailure: message(error) })
        return false
      }
      if (document !== this.#state.document) return false
      if (!this.#file(path)) this.#set({ open: [...this.#state.open, { path, base: answer.content, version: answer.version, dirty: false }] })
    }
    this.#set({ active: path, openFailure: undefined, ...this.#state.layout !== 'split' ? { layout: 'source' as const } : {}, ...at ? { reveal: { path, ...at, seq: ++this.#revealed } } : {} })
    return true
  }

  async createFile(path: string): Promise<void> {
    const document = this.#state.document
    if (document === undefined) return
    await this.client.createSource('', path)
    if (this.#state.document !== document) return
    await this.#readFiles(document)
    await this.openFile(path)
    void this.#readStatus(document)
    void this.#readChanges(document)
  }

  async openSource(document: string, path: string, at?: Omit<Reveal, 'path' | 'seq'>): Promise<void> {
    const destination = document === '' ? this.#state.document ?? document : document
    const open = async () => {
      if (destination !== this.#state.document) await this.#openDocument(destination)
      if (destination !== this.#state.document) return
      if (this.#file(path)) await this.checkDisk([path])
      await this.openFile(path, at ?? { line: this.#state.active === path ? this.#state.line : 1 })
      this.#editor?.focus?.()
    }
    if (destination !== this.#state.document && this.#deferLeave(this.#state.open, open)) return
    await open()
  }

  closeFile(path: string): void {
    if (this.#deferLeave(this.#state.open.filter(file => file.path === path), () => this.#closeFile(path))) return
    this.#closeFile(path)
  }

  #closeFile(path: string): void {
    const index = this.#state.open.findIndex(file => file.path === path)
    if (index < 0) return
    const open = this.#state.open.filter(file => file.path !== path)
    this.#set({ open, ...this.#state.active === path ? { active: open[Math.min(index, open.length - 1)]?.path } : {}, ...!open.length && this.#state.previewTabs.length ? { layout: 'preview' as const } : {} })
  }

  #deferLeave(files: OpenFile[], leave: () => void | Promise<void>): boolean {
    const dirty = files.filter(file => file.dirty).map(file => file.path)
    if (!dirty.length) return false
    this.#leave = leave
    this.#set({ leaving: dirty, leaveSaving: false, leaveFailed: false })
    return true
  }

  async resolveLeave(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
    if (this.#state.leaveSaving) return
    const leave = this.#leave
    if (choice === 'save') {
      this.#set({ leaveSaving: true, leaveFailed: false })
      for (const path of this.#state.leaving ?? []) await this.save(path)
      if (this.#state.leaving?.some(path => this.#file(path)?.dirty)) {
        this.#set({ leaveSaving: false, leaveFailed: true })
        return
      }
    }
    this.#leave = undefined
    this.#set({ leaving: undefined, leaveSaving: false, leaveFailed: false })
    if (choice !== 'cancel') await leave?.()
  }

  showFile(path: string): void {
    if (this.#file(path)) this.#set({ active: path, ...this.#state.layout !== 'split' ? { layout: 'source' as const } : {} })
  }

  edited(path: string, text: string): void {
    const file = this.#file(path)
    if (file && file.dirty !== (text !== file.base)) this.#update(path, { dirty: text !== file.base })
  }

  async save(path = this.#state.active): Promise<void> {
    const file = this.#file(path)
    const document = this.#state.document
    if (!file || document === undefined || this.#saving.has(file.path)) return
    const text = this.textOf(file.path) ?? file.base
    this.#saving.add(file.path)
    try {
      const { version } = await this.client.save('', file.path, text, file.version)
      this.#update(file.path, { base: text, version, dirty: this.textOf(file.path) !== text, notice: undefined })
      void this.#readStatus(document)
    } catch (error) {
      const answer = error instanceof ServiceError ? error.answer : undefined
      if (answer?.locked) this.#update(file.path, { notice: { kind: 'locked', holder: answer.locked.holder } })
      else if (answer?.conflict) this.#update(file.path, { notice: { kind: 'changed', ...answer.conflict } })
      else this.#update(file.path, { notice: { kind: 'failed', message: message(error) } })
    } finally {
      this.#saving.delete(file.path)
    }
  }

  reload(path: string): void {
    const file = this.#file(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    this.#update(path, { base: content, version, dirty: false, notice: undefined })
    this.#editor?.replace(path, content, true)
    this.#editor?.focus?.()
  }

  merge(path: string, labels: MergeLabels): void {
    const file = this.#file(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    const merged = mergeTexts(this.textOf(path) ?? file.base, file.base, content, labels)
    this.#update(path, { base: content, version, notice: { kind: 'merged', conflicts: merged.conflicts }, dirty: merged.text !== content })
    this.#editor?.replace(path, merged.text, false)
    this.#editor?.focus?.()
  }

  async checkDisk(paths = this.#state.open.map(file => file.path)): Promise<void> {
    const document = this.#state.document
    if (document === undefined) return
    for (const path of paths) {
      const file = this.#file(path)
      if (!file || this.#saving.has(path)) continue
      const known = file.version
      let answer: SourceAnswer
      try {
        answer = await this.client.source('', path)
      } catch {
        continue
      }
      const now = this.#file(path)
      if (!now || answer.version === now.version || now.version !== known || this.#saving.has(path)) continue
      if (!now.dirty) {
        this.#update(path, { base: answer.content, version: answer.version, notice: undefined })
        this.#editor?.replace(path, answer.content, true)
      } else if (now.notice?.kind !== 'locked' && (now.notice?.kind !== 'changed' || now.notice.version !== answer.version)) {
        this.#update(path, { notice: { kind: 'changed', version: answer.version, content: answer.content } })
      }
    }
  }

  moved(line: number): void {
    if (line !== this.#state.line) this.#set({ line })
    clearTimeout(this.#highlightTimer)
    this.#highlightTimer = setTimeout(() => {
      const doc = this.#state.ir?.doc
      const path = this.#state.active
      if (!doc || !path) return
      const place = placeAt(doc, path, line)
      this.#highlight = place ? { section: place.section, ...place.block ? { block: place.block } : {} } : null
      this.#broadcast({ type: 'highlight', target: this.#highlight })
    }, 150)
  }

  async revealPlace(section: string, block?: string): Promise<void> {
    const doc = this.#state.ir?.doc
    const place = doc && placeOf(doc, section, block)
    if (!place) return
    await this.openFile(place.source.file, { line: place.source.line, ...place.source.endLine ? { endLine: place.source.endLine } : {}, mark: true })
  }

  async revealProblem(finding: Finding): Promise<void> {
    if (!finding.source?.file) return
    await this.openFile(finding.source.file, { line: finding.source.line ?? 1 })
  }

  setView(view: PreviewRenderer): void {
    if (view === this.#state.view) return
    this.#set({ view, preview: undefined, previewFailure: undefined, shown: undefined })
    const document = this.#state.document
    if (document !== undefined && !(document === '' && this.#state.documents?.single === false)) void this.#readPreview(document)
  }

  setLayout(layout: DocumentLayout): void {
    if (layout !== 'source' && !this.#state.previewTabs.length) this.#set({ previewTabs: [this.#state.view] })
    this.#set({ layout })
  }

  openPreview(view: PreviewRenderer = this.#state.view, beside = false): void {
    if (!this.#state.previewTabs.includes(view)) this.#set({ previewTabs: [...this.#state.previewTabs, view] })
    this.setView(view)
    this.setLayout(beside && this.#state.open.length ? 'split' : 'preview')
  }

  closePreview(view: PreviewRenderer): void {
    const tabs = this.#state.previewTabs.filter(tab => tab !== view)
    this.#set({ previewTabs: tabs, ...!tabs.length ? { layout: 'source' as const } : {} })
    if (tabs.length && this.#state.view === view) this.setView(tabs[tabs.length - 1]!)
  }

  reloadPreview(): void {
    this.#set({ previewReload: this.#state.previewReload + 1 })
    const address = this.#state.view === 'slides' ? this.#state.preview?.slides : this.#state.preview?.web
    if (!address) this.retryPreview()
  }

  selectSource(selection: { startLine: number, endLine: number, text: string }): void {
    const { active, document } = this.#state
    if (!active || document === undefined) return
    if (document === '' && this.#state.documents?.single === false) return
    const prefix = document ? `${document}/` : ''
    const workspace = Boolean(prefix && !active.startsWith(prefix))
    this.setFocus([{ id: 'selection', from: 'source', ...workspace ? { scope: 'workspace' as const } : {}, source: { file: workspace ? active : active.slice(prefix.length), startLine: selection.startLine, endLine: selection.endLine }, quote: selection.text.slice(0, 2000) }])
  }

  setFocus(focus: FocusReport[]): void {
    const document = this.#state.document
    if (document === undefined) return
    const version = ++this.#focusVersion
    this.#set({ focus, focusPending: true, focusFailure: undefined })
    this.#broadcast({ type: 'pins', targets: focus.flatMap(item => item.section && item.block ? [{ id: item.id, section: item.section, block: item.block, label: '1' }] : []) })
    this.#focusWriting = this.#focusWriting.then(async () => {
      if (version !== this.#focusVersion) return
      try {
        const answer = await this.client.focus(document, focus)
        if (version === this.#focusVersion && document === this.#state.document) this.#set({ focus: answer.focus ?? [], focusPending: false })
      } catch (error) {
        if (version === this.#focusVersion && document === this.#state.document) this.#set({ focusPending: false, focusFailure: message(error) })
      }
    })
  }

  setPicking(picking: boolean): void {
    this.#set({ picking })
    this.#broadcast({ type: 'pick', on: picking })
  }

  attachPreview(sink: PreviewSink): () => void {
    this.#previews.add(sink)
    sink.send({ type: 'appearance', dark: this.#state.dark })
    sink.send({ type: 'pick', on: this.#state.picking })
    sink.send({ type: 'highlight', target: this.#highlight })
    return () => this.#previews.delete(sink)
  }

  previewReport(document: string, view: PreviewRenderer, report: PreviewReport): void {
    if (document !== this.#state.document || view !== this.#state.view) return
    switch (report.type) {
      case 'ready':
        this.#set({ shown: report.revision })
        break
      case 'updated':
        this.#set({ shown: report.revision })
        break
      case 'picked':
        {
          const section = this.#state.ir?.doc.sections.find(section => section.id === report.section)
          const step = section && report.trail ? trailStep(stepKeys(section), report.trail) : report.step
          this.setFocus([{ id: 'selection', from: view, section: report.section, ...report.block ? { block: report.block } : {}, ...step === undefined ? {} : { step } }])
          if (this.#state.layout !== 'preview') void this.revealPlace(report.section, report.block)
        }
        break
      case 'selection':
        if (report.selection?.text.trim()) this.setFocus([{ id: 'selection', from: view, section: report.selection.section, ...report.selection.block ? { block: report.selection.block } : {}, quote: report.selection.text.slice(0, 2000) }])
        break
      case 'shortcut':
        for (const listener of this.#commands) listener(report.command)
        break
      default:
        break
    }
  }

  retryPreview(): void {
    if (this.#state.document !== undefined) void this.#readPreview(this.#state.document)
  }

  #broadcast(command: PreviewCommand): void {
    for (const preview of this.#previews) preview.send(command)
  }

  #stop(): void {
    this.#focusVersion++
    this.#repairRequest++
    this.#stopEvents?.()
    this.#stopReview?.()
    this.#stopDiagnostics?.()
    this.#diagnosticsScope++
    this.#stopEvents = this.#stopReview = undefined
    this.#stopDiagnostics = undefined
  }

  dispose(): void {
    this.#stop()
    this.#commands.clear()
    this.#repairDiagnostics.clear()
    clearTimeout(this.#highlightTimer)
  }
}

const NO_CHANGES = { review: undefined, changed: undefined, history: undefined, changesFailure: undefined }

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
