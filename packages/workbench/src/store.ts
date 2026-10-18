/**
 * The workbench's state and what it does, bound to no framework (docs/design-dsh.md
 * 7.1 and 7.3): the workspace's documents and their operations, the document open,
 * its files, its IR and diagnostics (followed through `ir/events`), the files open
 * in the source editor (each with the text it had on disk when it was opened or last
 * saved, and that text's version), the previews (the protocol's workbench side) and
 * how the source and the previews follow each other. The panels read it and call it;
 * one instance serves every panel of a page, wherever the layout places them (the root
 * layout, or DeepSeek Harness's own layout: 7.2).
 *
 * A save names the version it changes; a file changed on disk since then answers 409
 * with what is there, and the author merges or reloads. A file not changed in the
 * editor follows the disk by itself: `ir/events` names the files whose change made a
 * compilation.
 */
import type { Finding, PreviewAnchor, PreviewCommand, PreviewReport } from '@presmium/kernel'
import type { DocumentOperation, DocumentsAnswer, FilesAnswer, IrAnswer, IrEvent, OperationAnswer, PreviewAnswer, SourceAnswer } from './api.ts'
import { mergeTexts } from './merge.ts'
import type { MergeLabels } from './merge.ts'
import { placeAt, placeOf } from './places.ts'
import { ServiceError, workspaceClient } from './service.ts'
import type { WorkspaceClient } from './service.ts'

/** The workbench's interface languages (docs/design-dsh.md 7.6). */
export type Locale = 'zh-CN' | 'en'

/** The form a preview shows. */
export type PreviewView = 'web' | 'slides'

/** What the source pane says of a file. */
export type FileNotice =
  /** It changed on disk since it was opened, and in the editor too: merge or reload. */
  | { kind: 'changed', version: string, content: string }
  | { kind: 'merged', conflicts: number }
  /** Another writer holds its document (an agent's change under review, an undo). */
  | { kind: 'locked', holder: string }
  | { kind: 'failed', message: string }

export interface OpenFile {
  /** Relative to the workspace root. */
  path: string
  /** The text on disk when it was opened, last saved or merged, and its version. */
  base: string
  version: string
  /** The editor's text differs from `base`. */
  dirty: boolean
  notice?: FileNotice
}

/** A place to show in a file: the cursor goes there; `mark` marks the lines (a block picked in the preview). */
export interface Reveal {
  path: string
  line: number
  endLine?: number
  mark?: boolean
  seq: number
}

/** A problem of a preview's page at run time (`report`), apart from the IR's diagnostics. */
export interface PageIssue {
  level: 'error' | 'warning'
  plugin?: string
  message: string
}

export interface WorkbenchState {
  locale: Locale
  dark: boolean
  documents?: DocumentsAnswer
  /** Why the documents could not be read. */
  failure?: string
  /**
   * The host has no route to the workspace service: the bundle that brings them was turned off in DeepSeek Harness's
   * Plugins page (docs/design-dsh.md section 17, item 6), while the page's client part is still loaded.
   */
  noRoutes?: boolean
  /** The document open (its directory); none on the home page. */
  document?: string
  files?: FilesAnswer
  ir?: IrAnswer
  open: OpenFile[]
  active?: string
  /** Why the last file asked for did not open. */
  openFailure?: string
  /** The line of the cursor in the file shown. */
  line: number
  reveal?: Reveal
  view: PreviewView
  preview?: PreviewAnswer
  previewFailure?: string
  /** The revision of the IR the preview shows (`ready`, `updated`). */
  shown?: string
  issues: PageIssue[]
  /** The previews are in pick mode. */
  picking: boolean
}

/** How the store reaches the editor's texts. */
export interface EditorBridge {
  text(path: string): string | undefined
  /** Replaces a file's text: an edit the author may undo, or (`fresh`) a text loaded anew. */
  replace(path: string, text: string, fresh: boolean): void
  /** Gives the editor the focus back (after a merge or a reload, whose button is gone). */
  focus?(): void
}

/** A preview attached to the store: it sends what the store asks. */
export interface PreviewSink {
  send(command: PreviewCommand): void
}

type Listener = () => void

/** The language of the page: `zh*` is Chinese, anything else English (N-07). */
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
  #revealed = 0
  #highlightTimer?: ReturnType<typeof setTimeout>
  /** The last highlight asked for, sent to a preview that becomes ready. */
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

  // The store ------------------------------------------------------------------------------------------

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

  // The page ---------------------------------------------------------------------------------------------

  setLocale(locale: Locale): void {
    if (locale !== this.#state.locale) this.#set({ locale })
  }

  setDark(dark: boolean): void {
    if (dark === this.#state.dark) return
    this.#set({ dark })
    this.#broadcast({ type: 'appearance', dark })
  }

  // The documents ------------------------------------------------------------------------------------------

  async loadDocuments(): Promise<void> {
    try {
      this.#set({ documents: await this.client.documents(), failure: undefined, noRoutes: false })
    } catch (error) {
      this.#set({ failure: message(error), noRoutes: error instanceof ServiceError && error.status === 404 })
    }
  }

  /** One document operation (one commit); the list is read again, and a document gone is closed. */
  async operate(operation: DocumentOperation): Promise<OperationAnswer> {
    const answer = await this.client.operate(operation)
    if (operation.op !== 'create' && operation.op !== 'copy' && this.#state.document === operation.dir) this.closeDocument()
    await this.loadDocuments()
    return answer
  }

  /** Opens a document: its files, its IR, its preview, and the events of its compilations. */
  async openDocument(dir: string): Promise<void> {
    if (this.#state.document === dir) return
    this.#stopEvents?.()
    this.#set({ document: dir, files: undefined, ir: undefined, open: [], active: undefined, line: 1, reveal: undefined, preview: undefined, previewFailure: undefined, shown: undefined, issues: [] })
    this.#stopEvents = this.client.events(dir, event => void this.#compiled(dir, event), () => void this.#readIr(dir))
    await Promise.all([this.#readFiles(dir), this.#readIr(dir), this.#readPreview(dir), this.#readStatus(dir)])
  }

  closeDocument(): void {
    this.#stopEvents?.()
    this.#stopEvents = undefined
    this.#set({ document: undefined, files: undefined, ir: undefined, open: [], active: undefined, reveal: undefined, preview: undefined, shown: undefined, issues: [] })
    void this.loadDocuments()
  }

  async #readFiles(dir: string): Promise<void> {
    try {
      const files = await this.client.files(dir)
      if (this.#state.document === dir) this.#set({ files })
    } catch {
      // The tree says it has nothing.
    }
  }

  async #readIr(dir: string): Promise<void> {
    try {
      const ir = await this.client.ir(dir)
      if (this.#state.document === dir) this.#set({ ir })
    } catch {
      // Diagnostics come with the next compilation.
    }
  }

  async #readStatus(dir: string): Promise<void> {
    try {
      const documents = await this.client.documents(dir)
      if (this.#state.document === dir) this.#set({ documents: { ...documents, documents: this.#state.documents?.documents ?? documents.documents } })
    } catch {
      // The status bar shows what it had.
    }
  }

  async #readPreview(dir: string): Promise<void> {
    try {
      const preview = await this.client.preview(dir)
      if (this.#state.document === dir) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (this.#state.document === dir) this.#set({ previewFailure: message(error) })
    }
  }

  /** A compilation of the open document: its IR again, and the open files it names compared with the disk. */
  async #compiled(dir: string, event: IrEvent): Promise<void> {
    if (this.#state.document !== dir) return
    if (event.revision !== this.#state.ir?.revision) await this.#readIr(dir)
    const changed = this.#state.open.filter(file => event.files.includes(file.path)).map(file => file.path)
    if (changed.length > 0) {
      await this.checkDisk(changed)
      void this.#readStatus(dir)
    }
    if (event.files.some(file => !this.#state.files?.files.some(listed => listed.path === file))) void this.#readFiles(dir)
  }

  // The source editor ------------------------------------------------------------------------------------------

  bindEditor(editor: EditorBridge): () => void {
    this.#editor = editor
    return () => {
      if (this.#editor === editor) this.#editor = undefined
    }
  }

  /** A file's text as the author has it: the editor's, else the disk's. */
  textOf(path: string): string | undefined {
    const file = this.#file(path)
    return file && (this.#editor?.text(path) ?? file.base)
  }

  /** Opens a file of the document (or shows it, when it is open), at a place in it. */
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

  /** The editor's text of a file changed: whether it differs from the disk's. */
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

  /** Takes the disk's text of a file changed there, dropping the editor's. */
  reload(path: string): void {
    const file = this.#file(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    this.#update(path, { base: content, version, dirty: false, notice: undefined })
    this.#editor?.replace(path, content, true)
    this.#editor?.focus?.()
  }

  /** Merges the editor's text with the disk's, from the text both started from; saving writes it. */
  merge(path: string, labels: MergeLabels): void {
    const file = this.#file(path)
    if (file?.notice?.kind !== 'changed') return
    const { content, version } = file.notice
    const merged = mergeTexts(this.textOf(path) ?? file.base, file.base, content, labels)
    this.#update(path, { base: content, version, notice: { kind: 'merged', conflicts: merged.conflicts }, dirty: merged.text !== content })
    this.#editor?.replace(path, merged.text, false)
    this.#editor?.focus?.()
  }

  /**
   * Compares open files with the disk: one not changed in the editor takes the
   * disk's text; one changed there says so, for a merge or a reload.
   */
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
      // Saved or merged meanwhile: the answer may be older than what the file knows.
      if (!now || answer.version === now.version || now.version !== known || this.#saving.has(path)) continue
      if (!now.dirty) {
        this.#update(path, { base: answer.content, version: answer.version, notice: undefined })
        this.#editor?.replace(path, answer.content, true)
      } else if (now.notice?.kind !== 'locked' && (now.notice?.kind !== 'changed' || now.notice.version !== answer.version)) {
        this.#update(path, { notice: { kind: 'changed', version: answer.version, content: answer.content } })
      }
    }
  }

  // Source and preview following each other ------------------------------------------------------------------------------

  /** The cursor moved in the file shown: the preview frames the block it is in (debounced). */
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

  /** A block or a section picked in a preview: its file opens at its lines, marked. */
  async revealPlace(section: string, block?: string): Promise<void> {
    const doc = this.#state.ir?.doc
    const place = doc && placeOf(doc, section, block)
    if (!place) return
    await this.openFile(place.source.file, { line: place.source.line, ...place.source.endLine ? { endLine: place.source.endLine } : {}, mark: true })
  }

  /** A diagnostic chosen in the problems panel: its file opens at its line. */
  async revealProblem(finding: Finding): Promise<void> {
    if (!finding.source?.file) return
    await this.openFile(finding.source.file, { line: finding.source.line ?? 1 })
  }

  // The previews ------------------------------------------------------------------------------------------

  setView(view: PreviewView): void {
    this.#set({ view })
  }

  setPicking(picking: boolean): void {
    this.#set({ picking })
    this.#broadcast({ type: 'pick', on: picking })
  }

  /** A preview attached: it gets the page's appearance, the pick mode and the last highlight. */
  attachPreview(sink: PreviewSink): () => void {
    this.#previews.add(sink)
    sink.send({ type: 'appearance', dark: this.#state.dark })
    sink.send({ type: 'pick', on: this.#state.picking })
    sink.send({ type: 'highlight', target: this.#highlight })
    return () => this.#previews.delete(sink)
  }

  /** What a preview's page said. */
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

  /** Asks the preview service for the previews' addresses again (after a failure). */
  retryPreview(): void {
    if (this.#state.document !== undefined) void this.#readPreview(this.#state.document)
  }

  #broadcast(command: PreviewCommand): void {
    for (const preview of this.#previews) preview.send(command)
  }

  dispose(): void {
    this.#stopEvents?.()
    clearTimeout(this.#highlightTimer)
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
