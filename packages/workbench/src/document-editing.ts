import { duplicateDocumentPage, errorMessage, moveDocumentPage, pageDeletion, randomUUID, removeDocumentPage, renameDocumentPage } from '@lincyaw/kernel'
import type { PageDeletePlan, TeachingDocument } from '@lincyaw/kernel'
import { undoDepth, redoDepth } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import { isAgentChanging } from './workbench-state.ts'
import type { WorkbenchStore } from './workbench-state.ts'
import type { DocumentSession, DocumentSessionState } from './document-session.ts'
import { DocumentReturnPoints, documentReturnStep, documentViewportOffset, restoreDocumentViewport } from './document-return-point.ts'
import type { DocumentReturnPoint } from './document-return-point.ts'
import type { NativeDocumentEditor } from './document-editor/schema.tsx'
import type { DocumentEditorCommands } from './document-editor/DocumentEditor.tsx'
import type { DocumentInsertionPlace } from './document-editor/insertion-place.ts'
import { nativeBlockText, nativeTextPoint, nativeTextPosition } from './document-editor/selection.ts'
import type { NativeTextPoint } from './document-editor/selection.ts'
import type { DocumentFieldBookmark, DocumentFieldRegistration, DocumentHistoryEditor } from './document-editor/focus.ts'
import { contentText, MESSAGES } from './messages.ts'

interface EditingOptions {
  store: WorkbenchStore
  session: DocumentSession
  scope(): number
  flush(signal?: AbortSignal): Promise<void>
  goToSection(section: string): void
  rememberStep(directory: string, section: string, step: number): void
  canAskAnimation(): boolean
  askAnimation(place: DocumentInsertionPlace): boolean
}

/** Native editor selection, focus, page changes and viewport restoration share one document lifetime. */
export class DocumentEditing {
  #documentEditor?: NativeDocumentEditor
  #documentEditorCommands?: DocumentEditorCommands
  #documentEditorBinding?: { identity: string, reset: number }
  readonly #documentReturnPoints = new DocumentReturnPoints()
  #documentViewport?: { element: HTMLElement, identity: string, returnScrollTop?: number, stop(): void }
  #stopDocumentReturnScroll?: () => void
  #openingDocument?: { directory: string, scope: number, generation: number, focus?: 'body', initial?: boolean, stop(): void,
    basis?: { identity: string, reset: number, version?: string, content: TeachingDocument }, point?: DocumentReturnPoint, fallback?: DocumentReturnPoint }
  #stopDocumentLayoutScroll?: () => void
  #activeDocumentHistory?: DocumentHistoryEditor
  #unsubscribeDocumentHistory?: () => void
  #unsubscribeDocumentSelection?: () => void
  #generation = 0
  #pendingDocumentFocus?: { documentId: string, nodeId: string, generation: number, afterSave?: true }
  #pendingDocumentSelection?: { documentId: string, anchor: NativeTextPoint, head: NativeTextPoint, focused: boolean }
  readonly #documentFields = new Map<string, DocumentFieldRegistration>()
  #pendingDocumentField?: { field: Omit<DocumentFieldRegistration, 'focus' | 'editor'>, bookmark: DocumentFieldBookmark, reset: number, generation: number }
  readonly #store: WorkbenchStore
  readonly #session: DocumentSession
  readonly #options: EditingOptions

  constructor(options: EditingOptions) { this.#options = options; this.#store = options.store; this.#session = options.session }
  get generation(): number { return this.#generation }
  get returnPoints(): DocumentReturnPoints { return this.#documentReturnPoints }
  sourceChanged(authoring: DocumentSessionState): void {
    const pending = this.#pendingDocumentField
    if (pending && (pending.field.identity !== authoring.identity || authoring.reset > pending.reset
      || pending.field.blockId !== undefined && !authoring.content?.blocks[pending.field.blockId]
      || !authoring.content?.steps[pending.field.stepId])) this.#pendingDocumentField = undefined
  }
  rememberComponent(content: TeachingDocument, identity: string): void {
    if (this.#documentEditorBinding?.identity === identity) this.#documentEditorCommands?.rememberComponentConfiguration(content)
  }
  beforePosition(): void { this.cancelOpening(); this.#stopDocumentReturnScroll?.() }
  nativeHistory(action: 'undo' | 'redo'): boolean | undefined {
    const state = this.#store.state
    if (state.mode !== 'editing') return false
    if (this.#activeDocumentHistory && (state.editorHistory?.[action] || state.editorHistory?.field)) {
      this.#activeDocumentHistory.focus()
      return this.#activeDocumentHistory[action]()
    }
  }
  reset(): void {
    this.saveReturnPoint(); this.cancelOpening(); this.#stopDocumentReturnScroll?.()
    this.#documentViewport?.stop(); this.#documentViewport = undefined; this.#documentEditorBinding = undefined
    this.#unsubscribeDocumentHistory?.(); this.#unsubscribeDocumentHistory = undefined; this.#activeDocumentHistory = undefined; this.#documentEditor = undefined
    this.#unsubscribeDocumentSelection?.(); this.#unsubscribeDocumentSelection = undefined
    this.#stopDocumentLayoutScroll?.(); this.#stopDocumentLayoutScroll = undefined
    this.#pendingDocumentFocus = undefined; this.#pendingDocumentSelection = undefined; this.#generation++
    this.#documentFields.clear(); this.#pendingDocumentField = undefined
    this.#documentEditorCommands = undefined
  }

  #watchOpeningInteraction(cancel: () => void): () => void {
    if (typeof document === 'undefined') return () => {}
    const focused = document.activeElement, dialog = focused?.closest('[role="dialog"]')
    const interact = (event: Event) => {
      if (!event.isTrusted) return
      if (event.type === 'focusin' && (!(event.target instanceof Element) || event.target === focused || dialog?.contains(event.target))) return
      cancel()
    }
    const events = ['pointerdown', 'keydown', 'beforeinput', 'wheel', 'touchmove', 'focusin']
    for (const event of events) document.addEventListener(event, interact, true)
    return () => { for (const event of events) document.removeEventListener(event, interact, true) }
  }

  cancelOpening(): void {
    const pending = this.#openingDocument
    this.#openingDocument = undefined
    pending?.stop()
  }

  beginOpening(directory: string, focus?: 'body', fallback?: DocumentReturnPoint): void {
    this.cancelOpening()
    this.#openingDocument = { directory, focus, fallback: fallback && { ...fallback }, scope: this.#options.scope(), generation: this.#generation,
      stop: this.#watchOpeningInteraction(() => this.cancelOpening()) }
  }

  saveReturnPoint(): void {
    const source = this.#store.state.authoring, position = this.#store.state.position
    if (!source?.identity || !source.content || source.loading || !position || !source.content.sectionOrder.includes(position.section)) return
    const section = source.content.sections[position.section]
    let stepId = section?.stepOrder[position.step]
    if (this.#store.state.webView === 'present' || position.view === 'present') {
      const snapshot = this.#store.state.presentationSnapshot, ir = this.#store.state.ir
      if (!snapshot || !ir || source.dirty || source.saving || source.error || snapshot.version !== source.version || snapshot.fingerprint !== source.fingerprint
        || snapshot.project !== (source.projectRevision ?? 0) || snapshot.revision !== ir.revision || snapshot.revision !== this.#store.state.previewIrRevision) return
      const ids = ir.doc.sections.find(page => page.id === position.section)?.stepIds
      if (!ids || ids.length && !ids[position.step]) return
      stepId = ids[position.step]
      if (stepId && (!section?.stepOrder.includes(stepId) || source.content.steps[stepId]?.sectionId !== position.section)) return
    }
    if (!section || !stepId && section.stepOrder.length) return
    const viewport = this.#documentViewport, previous = this.#documentReturnPoints.read(source.identity)
    const measured = this.#store.state.webView === 'document' && viewport?.identity === source.identity ? documentViewportOffset(viewport.element, section.id) : undefined
    const offset = measured ?? (previous?.sectionId === section.id ? previous.offset : undefined)
    this.#documentReturnPoints.write(source.identity, { sectionId: section.id, ...stepId ? { stepId } : {}, ...offset !== undefined ? { offset } : {} })
  }

  finishOpening(): void {
    const pending = this.#openingDocument, source = this.#store.state.authoring
    if (!pending || source?.loading || !source?.identity || !source.content) return
    if (source.error === 'document-identity-changed') { this.cancelOpening(); return }
    if (pending.scope !== this.#options.scope() || pending.directory !== this.#store.state.document || pending.generation !== this.#generation) { this.cancelOpening(); return }
    if (!pending.basis) {
      pending.basis = { identity: source.identity, reset: source.reset, version: source.version, content: source.content }
      if (!pending.focus) {
        pending.point = this.#documentReturnPoints.read(source.identity) ?? pending.fallback
        if (!pending.point) {
          const section = source.content.sections[source.content.sectionOrder[0]!]
          if (!section) { this.cancelOpening(); return }
          pending.point = { sectionId: section.id, ...section.stepOrder[0] ? { stepId: section.stepOrder[0] } : {} }
          pending.initial = true
        }
        if (documentReturnStep(source.content, pending.point) === undefined) {
          this.#documentReturnPoints.forget(source.identity); this.cancelOpening()
          this.#store.set({ documentPositionFailure: 'removed' }); return
        }
      }
    }
    const basis = pending.basis
    if (source.identity !== basis.identity || source.reset !== basis.reset || source.version !== basis.version || source.content !== basis.content) { this.cancelOpening(); return }
    const editor = this.#documentEditor, binding = this.#documentEditorBinding, viewport = this.#documentViewport
    if (!editor || editor.prosemirrorView.isDestroyed || binding?.identity !== source.identity || binding.reset !== source.reset || viewport?.identity !== source.identity) return
    // The editor can mount read-only while the source is still loading; a read-only body cannot take the caret yet.
    if (pending.focus && !editor.isEditable) return
    this.cancelOpening()
    if (pending.focus) {
      const body = (blocks: typeof editor.document, sectionId?: string): { nodeId: string, sectionId: string } | undefined => {
        for (const block of blocks) {
          if (block.type === 'presmiumPage') sectionId = block.props.sectionId
          else if (sectionId && editor.schema.blockSchema[block.type].content === 'inline') return { nodeId: block.id, sectionId }
          const nested = body(block.children, sectionId)
          if (nested) return nested
        }
      }
      const target = body(editor.document)
      if (target && source.content.sections[target.sectionId]) {
        this.#store.set({ position: { section: target.sectionId, step: 0, trail: [], view: 'document' }, documentPositionFailure: undefined, documentNavigation: undefined })
        this.#focusDocumentNode(editor, target.nodeId)
      }
      return
    }
    const point = pending.point!, step = documentReturnStep(source.content, point)
    if (step === undefined) return
    this.#options.rememberStep(pending.directory, point.sectionId, step)
    this.#store.set({ position: { section: point.sectionId, step, trail: [], view: 'document' }, documentPositionFailure: undefined, documentNavigation: undefined })
    if (pending.initial) return
    const current = () => this.#store.state.document === pending.directory && this.#store.state.authoring?.identity === basis.identity
      && this.#store.state.authoring.reset === basis.reset && this.#store.state.authoring.version === basis.version && this.#store.state.authoring.content === basis.content
      && this.#documentViewport === viewport && this.#store.state.position?.section === point.sectionId && this.#store.state.position.step === step
    const restore = () => {
      if (!current()) { stop(); return }
      const top = viewport.element.scrollTop
      restoreDocumentViewport(viewport.element, point)
      if (viewport.element.scrollTop !== top) viewport.returnScrollTop = viewport.element.scrollTop
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(restore)
    let stopInteraction: () => void = () => {}
    const stop = () => { observer?.disconnect(); stopInteraction(); viewport.returnScrollTop = undefined; if (this.#stopDocumentReturnScroll === stop) this.#stopDocumentReturnScroll = undefined }
    this.#stopDocumentReturnScroll?.(); this.#stopDocumentReturnScroll = stop
    stopInteraction = this.#watchOpeningInteraction(stop)
    observer?.observe(viewport.element)
    observer?.observe(editor.prosemirrorView.dom)
    restore()
  }

  /** Consume only this viewport owner's actual programmatic destination; user gestures retire it. */
  consumeReturnScroll(element: HTMLElement): boolean {
    const viewport = this.#documentViewport, top = viewport?.returnScrollTop
    if (viewport?.element !== element || top === undefined) return false
    viewport.returnScrollTop = undefined
    return element.scrollTop === top
  }

  attachViewport(element: HTMLElement, identity: string): () => void {
    this.#documentViewport?.stop()
    const scroll = () => { if (!this.#openingDocument) this.saveReturnPoint() }
    const viewport = { element, identity, stop: () => element.removeEventListener('scroll', scroll) }
    this.#documentViewport = viewport
    element.addEventListener('scroll', scroll, { passive: true })
    this.finishOpening()
    return () => { if (this.#documentViewport === viewport) { this.saveReturnPoint(); this.#stopDocumentReturnScroll?.(); this.#documentViewport = undefined }; viewport.stop() }
  }

  /** The body editor became editable: an opening that waits to put the caret in it can finish now. */
  editorEditable(): void { this.finishOpening() }


  interact(): void {
    this.#generation++; this.cancelOpening(); this.#stopDocumentReturnScroll?.()
    if (this.#store.state.documentPositionFailure) this.#store.set({ documentPositionFailure: undefined })
  }
  pendingField(blockId: string | undefined, identity?: string): Pick<DocumentFieldRegistration, 'stepId'> | undefined {
    const pending = this.#pendingDocumentField, source = this.#store.state.authoring
    return pending && pending.generation === this.#generation && pending.field.blockId === blockId
      && pending.field.identity === (identity ?? source?.identity) && pending.reset === source?.reset ? pending.field : undefined
  }
  /** A live native field owns its target only while it still has focus in this source. */
  focusedField(): Readonly<Pick<DocumentFieldRegistration, 'identity' | 'reset' | 'blockId' | 'stepId'>> & { readonly editor: DocumentHistoryEditor } | undefined {
    const source = this.#store.state.authoring, editor = this.#activeDocumentHistory
    if (!source?.identity || !source.content || !editor || editor === this.#documentEditor || editor.prosemirrorView.isDestroyed || !editor.prosemirrorView.hasFocus()) return
    for (const field of this.#documentFields.values()) {
      if (field.editor !== editor || field.identity !== source.identity || field.reset !== source.reset) continue
      const step = source.content.steps[field.stepId], section = step && source.content.sections[step.sectionId]
      if (!step || !section?.stepOrder.includes(field.stepId)) return
      const { identity, reset, blockId, stepId } = field
      return { identity, reset, blockId, stepId, editor }
    }
    return undefined
  }
  registerField(field: DocumentFieldRegistration): () => void {
    if (field.identity !== this.#store.state.authoring?.identity || field.reset !== this.#store.state.authoring.reset) return () => {}
    const key = JSON.stringify([field.identity, field.blockId, field.stepId])
    this.#documentFields.set(key, field)
    const pending = this.#pendingDocumentField
    if (pending && pending.reset === field.reset && JSON.stringify([pending.field.identity, pending.field.blockId, pending.field.stepId]) === key) {
      this.#pendingDocumentField = undefined
      if (pending.generation === this.#generation && field.identity === this.#store.state.authoring?.identity && field.reset === this.#store.state.authoring.reset) field.focus.restore(pending.bookmark)
    }
    return () => {
      if (this.#documentFields.get(key) !== field) return
      this.#documentFields.delete(key)
      if (field.editor && this.#activeDocumentHistory === field.editor) this.activateHistory(this.#documentEditor)
    }
  }
  /** Toolbar commands use the focused native editor's own history, without replacing the body editor. */
  activateHistory(editor: DocumentHistoryEditor | undefined): void {
    if (editor && editor !== this.#documentEditor && ![...this.#documentFields.values()].some(field => field.editor === editor && field.identity === this.#store.state.authoring?.identity)) return
    if (editor === this.#activeDocumentHistory) return
    this.#unsubscribeDocumentHistory?.()
    this.#activeDocumentHistory = editor
    const update = () => this.#store.set({ editorHistory: editor ? { section: this.#store.state.position?.section ?? '', undo: undoDepth(editor.prosemirrorState) > 0, redo: redoDepth(editor.prosemirrorState) > 0, field: editor !== this.#documentEditor } : undefined })
    this.#unsubscribeDocumentHistory = editor?.onChange(update)
    update()
  }
  attachEditor(editor: NativeDocumentEditor | undefined, commands?: DocumentEditorCommands, binding?: { identity: string, reset: number }): void {
    if (binding && (binding.identity !== this.#store.state.authoring?.identity || binding.reset !== this.#store.state.authoring.reset)) return
    const wasBody = !this.#activeDocumentHistory || this.#activeDocumentHistory === this.#documentEditor
    if (editor !== this.#documentEditor) this.#session.composition(false, 'body')
    this.#unsubscribeDocumentSelection?.(); this.#stopDocumentLayoutScroll?.(); this.#stopDocumentLayoutScroll = undefined
    this.#documentEditor = editor; this.#documentEditorCommands = commands; this.#documentEditorBinding = editor ? binding : undefined
    if (editor) {
      const focus = this.#pendingDocumentFocus, selection = this.#pendingDocumentSelection
      this.#pendingDocumentFocus = undefined; this.#pendingDocumentSelection = undefined
      if (focus && focus.documentId === this.#store.state.authoring?.content?.id && focus.generation === this.#generation && editor.getBlock(focus.nodeId)) {
        // A deferred page operation adopts its selection only after the source write is acknowledged.
        if (!focus.afterSave) {
          this.#focusDocumentNode(editor, focus.nodeId)
        }
      } else if (!this.#pendingDocumentField && selection && selection.documentId === this.#store.state.authoring?.content?.id) {
        const anchor = nativeTextPosition(editor, selection.anchor), head = nativeTextPosition(editor, selection.head)
        if (anchor !== undefined && head !== undefined) {
          editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, anchor, head)))
          if (selection.focused) editor.focus()
        }
      }
    }
    if (wasBody) this.activateHistory(editor)
    if (editor) {
      const focus = () => this.activateHistory(editor)
      const element = editor.prosemirrorView.dom
      element.addEventListener('focusin', focus)
      if (editor.prosemirrorView.hasFocus()) focus()
      const stopSelection = editor.onSelectionChange(() => { this.#generation++ })
      this.#unsubscribeDocumentSelection = () => { this.#stopDocumentLayoutScroll?.(); stopSelection(); element.removeEventListener('focusin', focus) }
      commands?.handleAnimationRequests({ available: () => this.#options.canAskAnimation(), request: place => this.#options.askAnimation(place) })
    } else this.#unsubscribeDocumentSelection = undefined
    this.finishOpening()
  }
  /** `selectText`: the node's whole text is selected, so typing replaces it. */
  #focusDocumentNode(editor: NativeDocumentEditor, nodeId: string, selectText = false): void {
    this.#stopDocumentLayoutScroll?.(); this.#stopDocumentLayoutScroll = undefined
    editor.setTextCursorPosition(nodeId, 'start')
    const text = selectText ? nativeBlockText(editor, nodeId) : undefined
    if (text) editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, text.from, text.to)))
    editor.focus()
    editor.prosemirrorView.dispatch(editor.prosemirrorState.tr.scrollIntoView())
    // React node views can finish sizing after the native editor mounts.
    // Keep only this untouched focus visible through those layout changes.
    if (typeof ResizeObserver !== 'undefined') {
      const view = editor.prosemirrorView, document = view.dom.ownerDocument
      const source = this.#store.state.authoring!, identity = source.identity, reset = source.reset, documentId = source.content!.id
      const request = this.#store.state.documentNavigation?.request, selected = editor.prosemirrorState.selection
      let size = view.dom.getBoundingClientRect(), active = true
      const events = ['pointerdown', 'wheel', 'touchmove', 'keydown', 'beforeinput']
      const cancel = () => {
        if (!active) return
        active = false; observer.disconnect(); stopFocus(); stopSelection()
        for (const event of events) document.removeEventListener(event, interact, true)
      }
      const interact = (event: Event) => { if (event.isTrusted) cancel() }
      const stopFocus = editor.onFocusChange((_, { focused }) => { if (!focused) cancel() })
      const stopSelection = editor.onSelectionChange(cancel)
      const observer = new ResizeObserver(() => {
        if (!active) return
        const current = this.#store.state.authoring
        if (this.#documentEditor !== editor || view.isDestroyed || !current || current.identity !== identity || current.reset !== reset
          || current?.content?.id !== documentId || this.#store.state.documentNavigation?.request !== request
          || !editor.isFocused() || !editor.prosemirrorState.selection.eq(selected) || editor.getTextCursorPosition().block.id !== nodeId) { cancel(); return }
        const next = view.dom.getBoundingClientRect()
        if (next.width === size.width && next.height === size.height) return
        size = next
        view.dispatch(editor.prosemirrorState.tr.scrollIntoView())
      })
      for (const event of events) document.addEventListener(event, interact, true)
      observer.observe(view.dom)
      this.#stopDocumentLayoutScroll = cancel
    }
  }

  async #changeDocumentPage(change: (document: TeachingDocument) => void): Promise<boolean> {
    const source = this.#store.state.authoring, directory = this.#store.state.document
    if (!source?.content || directory === undefined || isAgentChanging(this.#store.state)) return false
    const scope = this.#options.scope(), identity = source.identity, documentId = source.content.id
    const current = () => scope === this.#options.scope() && directory === this.#store.state.document && identity === this.#store.state.authoring?.identity && documentId === this.#store.state.authoring?.content?.id
    this.#store.set({ isEditingPage: true, pageEditFailure: undefined })
    try {
      await this.#options.flush()
      if (!current()) throw new Error('page-context-changed')
      const document = structuredClone(this.#store.state.authoring!.content!)
      change(document)
      const editor = this.#documentEditor
      this.#pendingDocumentField = undefined
      const plannedFocus = this.#pendingDocumentFocus
      if (!plannedFocus || plannedFocus.generation !== this.#generation) for (const field of this.#documentFields.values()) {
        if (field.identity !== source.identity || field.reset !== this.#store.state.authoring!.reset || field.blockId !== undefined && !document.blocks[field.blockId] || !document.steps[field.stepId]) continue
        const bookmark = field.focus.capture()
        if (bookmark) {
          const { focus: _focus, editor: _editor, ...target } = field
          this.#pendingDocumentField = { field: target, bookmark, reset: this.#store.state.authoring!.reset + 1, generation: this.#generation }
          this.#pendingDocumentSelection = undefined
          break
        }
      }
      if (editor && !this.#pendingDocumentField) {
        const state = editor.prosemirrorState, anchor = nativeTextPoint(editor, state.selection.anchor), head = nativeTextPoint(editor, state.selection.head)
        if (anchor && head) this.#pendingDocumentSelection = { documentId: document.id, anchor, head, focused: editor.prosemirrorView.hasFocus() }
      }
      this.#session.replace(document)
      await this.#session.flush()
      return current()
    } catch (error) { if (current()) this.#store.set({ pageEditFailure: this.#pageEditMessage(errorMessage(error)) }); return false }
    finally { if (current()) this.#store.set({ isEditingPage: false }) }
  }
  renamePage(section: string, title: string): Promise<boolean> {
    return this.#changeDocumentPage(document => { Object.assign(document, renameDocumentPage(document, section, title)) })
  }
  async duplicatePage(section: string): Promise<boolean> {
    if (this.#store.state.isEditingPage || this.#store.state.isCreatingPage || this.#store.state.isHistoryBusy) return false
    const scope = this.#options.scope(), identity = this.#store.state.authoring?.identity, generation = this.#generation, navigation = this.#store.state.documentNavigation?.request
    let copied: string | undefined
    const saved = await this.#changeDocumentPage(document => {
      if (scope !== this.#options.scope() || identity !== this.#store.state.authoring?.identity) throw new Error('page-context-changed')
      const page = document.sections[section]
      if (!page) throw new Error('page-boundary')
      const copy = duplicateDocumentPage(document, section, contentText(document.metadata.lang).copyTitle(page.title), () => randomUUID())
      copied = copy.section
      Object.assign(document, copy.document)
      if (generation === this.#generation) this.#pendingDocumentFocus = { documentId: document.id, nodeId: `page:${copied}`, generation, afterSave: true }
    })
    // Source confirmation owns editing. A later author selection takes precedence over this response.
    if (!saved || !copied || scope !== this.#options.scope() || generation !== this.#generation || navigation !== this.#store.state.documentNavigation?.request || !this.#store.state.authoring?.content?.sections[copied]) return saved
    this.#options.goToSection(copied)
    const editor = this.#documentEditor
    if (editor) {
      const blocks = editor.document, start = blocks.findIndex(block => block.id === `page:${copied}`)
      const first = (nodes: typeof blocks): string | undefined => {
        for (const node of nodes) { if (node.type === 'presmiumPage') break; if (node.content !== undefined) return node.id; const child = first(node.children); if (child) return child }
        return undefined
      }
      const target = start < 0 ? undefined : first(blocks.slice(start + 1)) ?? blocks[start]!.id
      if (target) { editor.setTextCursorPosition(target, 'start'); editor.focus() }
    }
    return true
  }
  movePage(section: string, before: string | null): Promise<boolean> {
    return this.#changeDocumentPage(document => { Object.assign(document, moveDocumentPage(document, section, before)) })
  }
  deletionMessage(reason: string): string { return this.#pageEditMessage(reason) }
  async preparePageDeletion(section: string): Promise<PageDeletePlan> {
    await this.#options.flush()
    const source = this.#store.state.authoring
    if (!source?.content || !source.version || this.#store.state.document === undefined) throw new Error('document-unavailable')
    return pageDeletion(source.content, this.#store.state.document, source.version, section)
  }
  async deletePage(plan: PageDeletePlan): Promise<boolean> {
    if (!plan.allowed || plan.document !== this.#store.state.document) return false
    return this.#changeDocumentPage(document => {
      if (this.#store.state.authoring?.version !== plan.source.version) throw new Error('revision-conflict')
      const current = pageDeletion(document, plan.document, plan.source.version, plan.section)
      if (!current.allowed) throw new Error(current.reason)
      Object.assign(document, removeDocumentPage(document, plan.section, () => randomUUID()))
      this.#store.set({ position: { section: document.sectionOrder[0]!, step: 0, trail: [], view: 'document' }, documentNavigation: { section: document.sectionOrder[0]!, request: randomUUID() } })
    })
  }
  createPage(after = this.#store.state.position?.section): boolean {
    const source = this.#store.state.authoring, editor = this.#documentEditor, commands = this.#documentEditorCommands
    if (!source?.content || source.loading || source.composing || source.restored || source.error || !editor || !commands
      || editor.prosemirrorView.isDestroyed || isAgentChanging(this.#store.state) || this.#store.state.isEditingPage || this.#store.state.isCreatingPage
      || this.#store.state.isHistoryBusy || this.#store.state.isHistoryPreparing) return false
    try {
      this.#store.set({ pageEditFailure: undefined })
      const created = commands.insertPage(after, contentText(source.content.metadata.lang).newPage)
      this.#pendingDocumentField = undefined; this.#pendingDocumentSelection = undefined; this.#pendingDocumentFocus = undefined
      this.#store.set({ position: { section: created.sectionId, step: 0, trail: [], view: 'document' }, documentNavigation: { section: created.sectionId, request: randomUUID() } })
      // The default title is selected: the author's first words name the page, and Enter goes on to its body.
      this.#focusDocumentNode(editor, `page:${created.sectionId}`, true)
      return true
    } catch (error) { this.#store.set({ pageEditFailure: this.#pageEditMessage(errorMessage(error)) }); return false }
  }


  #pageEditMessage(reason: string): string {
    const t = MESSAGES[this.#store.state.locale]
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

  pageCapability(section: string): { rename: boolean, move: boolean, reason?: string } {
    const exists = Boolean(this.#store.state.authoring?.content?.sections[section])
    const capability = { rename: exists, move: exists }
    if (isAgentChanging(this.#store.state)) return { rename: false, move: false, reason: MESSAGES[this.#store.state.locale].saveLocked }
    if (this.#store.state.isCreatingPage || this.#store.state.isEditingPage || this.#store.state.isHistoryBusy) return { rename: false, move: false, reason: MESSAGES[this.#store.state.locale].pageEditBusy }
    return capability
  }

  clearFailure(): void { this.#store.set({ pageEditFailure: undefined }) }

}
