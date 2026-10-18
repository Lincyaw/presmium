import type { Finding, PreviewAnchor, PreviewCommand, PreviewReport } from '@presmium/kernel'
import type { DocumentOperation, DocumentsAnswer, FilesAnswer, HistoryRevision, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, ReviewFollowed, ReviewView, SourceAnswer, UncommittedFile } from './api.ts'
import { mergeTexts } from './merge.ts'
import type { MergeLabels } from './merge.ts'
import { placeAt, placeOf } from './places.ts'
import { ServiceError, workspaceClient } from './service.ts'
import type { WorkspaceClient } from './service.ts'

export type Locale = 'zh-CN' | 'en'

export type PreviewView = 'web' | 'slides'

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
  view: PreviewView
  preview?: PreviewAnswer
  previewFailure?: string
  shown?: string
  issues: PageIssue[]
  picking: boolean
  review?: ReviewView
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
  #editor?: EditorBridge
  readonly #previews = new Set<PreviewSink>()
  readonly #saving = new Set<string>()
  #stopEvents?: () => void
  #stopReview?: () => void
  #changeReads = 0
  #revealed = 0
  #highlightTimer?: ReturnType<typeof setTimeout>
  #highlight: PreviewAnchor | null = null

  constructor(options: { client?: WorkspaceClient, locale?: Locale, dark?: boolean } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language),
      dark: options.dark ?? false,
      open: [],
      line: 1,
      view: 'web',
      issues: [],
      picking: false,
    }
  }

  get state(): WorkbenchState {
    return this.#state
  }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
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
    this.#stop()
    this.#set({ document: dir, files: undefined, ir: undefined, open: [], active: undefined, line: 1, reveal: undefined, preview: undefined, previewFailure: undefined, shown: undefined, issues: [], ...NO_CHANGES })
    this.#stopEvents = this.client.events(dir, event => void this.#compiled(dir, event), () => void this.#readIr(dir))
    this.#stopReview = this.client.review(dir, event => this.#reviewed(dir, event))
    await Promise.all([this.#readFiles(dir), this.#readIr(dir), this.#readPreview(dir), this.#readStatus(dir), this.#readChanges(dir)])
  }

  closeDocument(): void {
    this.#stop()
    this.#set({ document: undefined, files: undefined, ir: undefined, open: [], active: undefined, reveal: undefined, preview: undefined, shown: undefined, issues: [], ...NO_CHANGES })
    void this.loadDocuments()
  }

  async #readFiles(dir: string): Promise<void> {
    try {
      const files = await this.client.files(dir)
      if (this.#state.document === dir) this.#set({ files })
    } catch {
    }
  }

  async #readIr(dir: string): Promise<void> {
    try {
      const ir = await this.client.ir(dir)
      if (this.#state.document === dir) this.#set({ ir })
    } catch {
    }
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

  #reviewed(dir: string, event: ReviewFollowed): void {
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
    try {
      const preview = await this.client.preview(dir)
      if (this.#state.document === dir) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (this.#state.document === dir) this.#set({ previewFailure: message(error) })
    }
  }

  async #compiled(dir: string, event: IrEvent): Promise<void> {
    if (this.#state.document !== dir) return
    if (event.revision !== this.#state.ir?.revision) await this.#readIr(dir)
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
        answer = await this.client.source(document, path)
      } catch (error) {
        this.#set({ openFailure: message(error) })
        return false
      }
      if (!this.#file(path)) this.#set({ open: [...this.#state.open, { path, base: answer.content, version: answer.version, dirty: false }] })
    }
    this.#set({ active: path, openFailure: undefined, ...at ? { reveal: { path, ...at, seq: ++this.#revealed } } : {} })
    return true
  }

  closeFile(path: string): void {
    const index = this.#state.open.findIndex(file => file.path === path)
    if (index < 0) return
    const open = this.#state.open.filter(file => file.path !== path)
    this.#set({ open, ...this.#state.active === path ? { active: open[Math.min(index, open.length - 1)]?.path } : {} })
  }

  showFile(path: string): void {
    if (this.#file(path)) this.#set({ active: path })
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
      const { version } = await this.client.save(document, file.path, text, file.version)
      this.#update(file.path, { base: text, version, dirty: this.textOf(file.path) !== text, notice: undefined })
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
        answer = await this.client.source(document, path)
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

  setView(view: PreviewView): void {
    this.#set({ view })
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

  previewReport(report: PreviewReport): void {
    switch (report.type) {
      case 'ready':
        this.#set({ shown: report.revision })
        break
      case 'updated':
        this.#set({ shown: report.revision })
        break
      case 'picked':
        void this.revealPlace(report.section, report.block)
        break
      case 'report':
        if (!this.#state.issues.some(issue => issue.message === report.message && issue.plugin === report.plugin)) {
          this.#set({ issues: [...this.#state.issues, { level: report.level, ...report.plugin ? { plugin: report.plugin } : {}, message: report.message }] })
        }
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
    this.#stopEvents?.()
    this.#stopReview?.()
    this.#stopEvents = this.#stopReview = undefined
  }

  dispose(): void {
    this.#stop()
    clearTimeout(this.#highlightTimer)
  }
}

const NO_CHANGES = { review: undefined, changed: undefined, history: undefined, changesFailure: undefined }

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
