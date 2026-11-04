import { DocumentProduction } from './document-production.ts'
import { DocumentEditing } from './document-editing.ts'
import { isAgentChanging } from './workbench-state.ts'
import type { AgentAnswer, AgentDraft, AgentRequest, PlaybackKey, Pointer, PreviewSink, WebView, WorkbenchMode, WorkbenchState, WorkbenchStore } from './workbench-state.ts'
import { enableDocumentProduction, randomUUID } from '@lincyaw/kernel'
import type { ProjectOperation, ProjectPlan, AuthoringWindowSnapshot, AuthoringWindowAction, AuthoringWindowRequest, AuthoringWindowRequestResult } from '@lincyaw/kernel'
import { CommentDraftBank } from './document-editor/comment-drafts.ts'
import { ComponentPropertyDrafts } from './component-property-drafts.ts'
import type { ComponentPropertyDraft } from './component-property-drafts.ts'
import { componentSource, reconcileComponentAction, sameComponentSource } from './component-properties.ts'
import { applyDocumentComponentAction, documentComponentSection, effectiveComponentParameters } from '@lincyaw/kernel'
import type { DocumentAuthoringActionPlan, DocumentComponentAction, AppliedDocumentAuthoringAction } from '@lincyaw/kernel'
import { inspectCommentDrafts } from './document-editor/comment-draft-inspection.ts'
import { mutateCommentDrafts } from './document-editor/comment-draft-actions.ts'
import { executeBodyDraftAction } from './body-draft-actions.ts'
import { inspectComponentDrafts } from './component-draft-inspection.ts'
import { mutateComponentDrafts } from './component-draft-actions.ts'
import { DocumentSession } from './document-session.ts'
import { disposeTranscriptionSessions } from './transcription-session.ts'
import { documentRecordingActive, disposeDocumentRecordings } from './audio-recording.ts'
import type { DocumentSessionState } from './document-session.ts'
import type { DocumentDraftReference } from './document-drafts.ts'
import type { DocumentReturnPoint } from './document-return-point.ts'
import type { DocumentChangeAnswer, TeachingDocument } from '@lincyaw/kernel'
import type { DocumentInsertionPlace } from './document-editor/insertion-place.ts'
import type { CanonicalSource, VoiceoverJob } from '@lincyaw/kernel'
import { compileDocumentPreview, readPreviewWhenReady, waitForPreviewRequest } from './document-preview.ts'
import { readDocumentSnapshot } from './document-preview.ts'
import { errorMessage, sameProductionBinding, slideShape, stepKeys, stepTrail, trailStep } from '@lincyaw/kernel'
import type { Diagnostic, Focus, FocusReport, IrAnswer, IrEvent, OperationAnswer, PreviewAnchor, PreviewCommand, PreviewDiagnostics, PreviewRenderer, PreviewReport, ReviewChange } from '@lincyaw/kernel'
import { DocumentDiagnostics } from './diagnostics.ts'
import { DocumentHistory } from './history.ts'
import { DocumentJobs } from './jobs.ts'
import { VoiceoverJobs } from './voiceover-jobs.ts'
import { localeOf, MESSAGES } from './messages.ts'
import type { AgentPlace, Locale } from './messages.ts'
import { changedPlaces, findPlaceAtLine } from './places.ts'
import { OperationLog } from './telemetry.ts'
import type { OperationValue } from './telemetry.ts'
import { PreviewPlayback } from './preview-playback.ts'
import { ProductionPlayback } from './production-playback.ts'
import type { ProductionBinding, ProductionPlan, ProductionPlaybackCommand, ProductionPlaybackState } from '@lincyaw/kernel'
import { workspaceClient, WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import type { AuthoringClientAction, AuthoringClientActionType, AuthoringClientActionResult, AuthoringClientSnapshot } from '@lincyaw/kernel'
import { PRODUCTION_PLAYBACK_RATES } from '@lincyaw/kernel'

type Listener = () => void
/** Mounted native controls advertise their own availability and execute the same human actions. */
export interface AuthoringClientControls {
  identity: string
  actions(): readonly AuthoringClientActionType[]
  snapshot?(): Pick<AuthoringClientSnapshot, 'mode' | 'recording'>
  execute(action: AuthoringClientAction, source: CanonicalSource, signal: AbortSignal, deadline?: number): Promise<void>
}
const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint

// The export of the lecture as a video (`@lincyaw/addon-lecture`).
export const VIDEO_TARGET = 'video'

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
  ir: undefined, preview: undefined, previewFailure: undefined, previewIrRevision: undefined, position: undefined, documentNavigation: undefined, documentPositionFailure: undefined,
  diagnostics: undefined, isDiagnosticsUnavailable: false, isRepairingDiagnostics: false, diagnosticsRepairFailure: undefined,
  pointer: undefined, save: { kind: 'idle' },
  focus: [], isFocusPending: false, focusFailure: undefined,
  review: undefined, history: undefined, outside: undefined, historyFailure: undefined, isHistoryBusy: false, askFailure: undefined,
  jobs: undefined, jobsFailure: undefined, jobPreparing: undefined,
  voiceoverJobs: undefined, voiceoverJobsFailure: undefined, voiceoverCacheRefresh: undefined,
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
  readonly production: DocumentProduction
  #removedDocumentPosition?: { identity: string, documentId: string, sectionId: string, stepId?: string, version: string, fingerprint: string, scope: number, generation: number, token: string }
  readonly editing: DocumentEditing
  #state: WorkbenchState
  readonly #listeners = new Set<Listener>()
  readonly #clientControls = new Set<AuthoringClientControls>()
  readonly #navigationGuards = new Set<() => boolean>()
  readonly #clientControlListeners = new Set<Listener>()
  #clientControlRevision = 0
  readonly #commentDrafts = new CommentDraftBank()
  readonly #componentPropertyDrafts = new ComponentPropertyDrafts()
  readonly #positionSeed = Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-')
  #positionSequence = 0
  readonly #selectedSteps = new Map<string, number>()
  #pendingGo?: { document: string | undefined, command: Extract<PreviewCommand, { type: 'go' }> }
  readonly #diagnostics: DocumentDiagnostics
  readonly #history: DocumentHistory
  readonly #jobs: DocumentJobs
  readonly #voiceover: VoiceoverJobs
  readonly #askers = new Set<(request: AgentRequest) => Promise<AgentAnswer | void>>()
  readonly #drafters = new Set<(draft: AgentDraft) => void | Promise<void>>()
  readonly #previewSinks = new Set<PreviewSink>()
  readonly #playbackKeys = new Set<(command: PlaybackKey) => void>()
  #unsubscribeIr?: () => void
  #runtimeDocument?: string
  #jobsDocument?: string
  readonly #jobObservers = new Set<symbol>()
  readonly #previewObservers = new Set<symbol>()
  #previewReads = 0
  #presentationPreparation = 0
  #presentationController?: AbortController
  #irReads = 0
  #focusVersion = 0
  #focusWriting: Promise<void> = Promise.resolve()
  #documentScope = 0
  #jobPreparation?: AbortController
  readonly #playback = new PreviewPlayback(() => ({ document: this.#state.document, scope: this.#documentScope, sinks: this.#previewSinks }))
  readonly #productionPlayback = new ProductionPlayback(() => ({ document: this.#state.document, scope: this.#documentScope, sinks: this.#previewSinks,
    binding: this.#state.productionPlan?.binding, ready: this.#productionReady() }), state => this.#set({ productionPlayback: state }))
  /** A place to show that no preview could take yet (none was attached, e.g. the chat covered the document). */
  #pendingReveal?: PreviewAnchor
  /** The AI's changes to show on the document once the preview has them. */
  #pendingFlash?: ReviewChange[]
  #lastPosition?: string
  #awaitingView?: WebView
  /** The forms asked for ahead of the author (`web:<dir>`, `slides:<dir>`), and the wait before asking for the slides. */
  /** What the author does, for the operator's collector when the host has one. */
  readonly telemetry: OperationLog
  readonly #preparationTimeoutMs: number

  constructor(options: { client?: WorkspaceClient, locale?: Locale, isDark?: boolean, preparationTimeoutMs?: number } = {}) {
    this.client = options.client ?? workspaceClient()
    this.#preparationTimeoutMs = Number.isFinite(options.preparationTimeoutMs) ? Math.max(1000, Math.min(300_000, options.preparationTimeoutMs!)) : 45_000
    this.#state = {
      locale: options.locale ?? localeOf(globalThis.navigator?.language) ?? 'en',
      isDark: options.isDark ?? false,
      mode: 'editing',
      previewRenderer: 'web',
      webView: 'document',
      previewReload: 0,
      previewConnection: 0,
      documentPositionToken: this.#nextDocumentPosition(),
      productionNavigationVersion: 0,
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
      this.editing.sourceChanged(authoring)
      const previous = this.#state.authoring
      // A saved timestamp belongs to this client's acknowledged source version.
      // Remote adoption has no server modification time to display in its place.
      const adoptedCleanVersion = Boolean(previous?.identity && previous.identity === authoring.identity
        && previous.version && authoring.version && previous.version !== authoring.version
        && !previous.loading && !authoring.loading && !previous.dirty && !authoring.dirty && !previous.saving && !authoring.saving)
      const position = this.#state.position
      const selected = position && previous && previous.identity === authoring.identity ? previous.content?.sections[position.section]?.stepOrder[position.step] : undefined
      const selectedStep = selected ? authoring.content?.steps[selected] : undefined, selectedPage = selectedStep ? authoring.content?.sections[selectedStep.sectionId] : undefined
      const selectedIndex = selectedPage?.stepOrder.indexOf(selected!) ?? -1
      const moved = position && selectedStep && selectedIndex >= 0 && (position.section !== selectedStep.sectionId || position.step !== selectedIndex)
      const removed = this.#state.webView === 'document' && position?.view !== 'present' && position && previous?.identity === authoring.identity
        && (selected ? !selectedStep || selectedIndex < 0 : !authoring.content?.sectionOrder.includes(position.section))
      const restoredPosition = !removed && this.#restoredDocumentPosition(authoring)
      const scope = this.#documentScope, generation = this.editing.generation
      if (removed && authoring.identity) this.editing.returnPoints.forget(authoring.identity)
      this.#set({ authoring,
        ...removed ? { position: undefined, documentNavigation: undefined, documentPositionFailure: 'removed' as const } : {},
        ...restoredPosition ? { documentPositionFailure: undefined } : {},
        ...moved ? { position: { ...position, section: selectedStep.sectionId, step: selectedIndex, trail: [] } } : {},
        ...this.production.draftState(authoring),
        save: authoring.error ? { kind: 'failed', message: authoring.error } : authoring.saving ? { kind: 'saving' } : !authoring.dirty && (previous?.dirty || previous?.saving) ? { kind: 'saved', at: new Date().toISOString() } : adoptedCleanVersion || this.#state.save.kind === 'failed' ? { kind: 'idle' } : this.#state.save })
      // The deletion owns the token produced above; source restoration only retires its notice.
      if (removed && previous?.identity && previous.content && previous.version && previous.fingerprint
        && !previous.loading && !previous.dirty && !previous.saving && !previous.restored && !previous.composing && !previous.recovering && !previous.error
        && scope === this.#documentScope && generation === this.editing.generation && !this.#state.position && this.#state.documentPositionFailure === 'removed') {
        this.#removedDocumentPosition = { identity: previous.identity, documentId: previous.content.id, sectionId: position.section,
          ...selected ? { stepId: selected } : {}, version: previous.version, fingerprint: previous.fingerprint, scope, generation, token: this.#state.documentPositionToken }
      }
      this.editing.finishOpening()
      // Native insertion can select a page before the source actor receives that new entity.
      if (position && previous && previous.identity === authoring.identity && !previous.content?.sections[position.section]
        && authoring.content?.sections[position.section]) this.editing.saveReturnPoint()
      if (this.#productionPlayback.changed()) void this.pausePlayback().catch(() => {})
      const acknowledgedSourceChanged = !authoring.dirty && !authoring.loading && !authoring.error && !previous?.loading
        && previous?.identity === authoring.identity && Boolean(previous?.version && authoring.version)
        && (previous?.version !== authoring.version || previous?.fingerprint !== authoring.fingerprint)
      if (!authoring.dirty && previous?.dirty || acknowledgedSourceChanged) { void this.#history.read(authoring.directory); void this.loadDocuments() }
    })
    this.production = new DocumentProduction({ store, session: this.#documentSession, client: this.client,
      scope: () => this.#documentScope, document: identity => this.getDocument(identity), flush: signal => this.flushPendingEdits(signal),
      pause: () => this.pausePlayback(), stopAuditions: () => this.stopAuditions(), stopPreviewOutputs: () => this.#playback.stopPreviewOutputs(),
      sourceCurrent: binding => this.#productionSourceCurrent(binding) })
    this.editing = new DocumentEditing({ store, session: this.#documentSession, scope: () => this.#documentScope,
      flush: signal => this.flushPendingEdits(signal), goToSection: section => this.goToSection(section),
      rememberStep: (directory, section, step) => { this.#selectedSteps.set(`${directory}\0${section}`, step) },
      canAskAnimation: () => this.#drafters.size > 0, askAnimation: place => this.draftAnimation(place) })
    this.#diagnostics = new DocumentDiagnostics(this.client, store)
    this.#jobs = new DocumentJobs(this.client, store)
    this.#voiceover = new VoiceoverJobs(this.client, store, (job, signal) => this.#refreshVoiceover(job, signal))
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

  /** Page-lifetime document navigation only; not a canonical source or playback revision. */
  get documentNavigationVersion(): number { return this.#documentScope }

  documentCommentDrafts(identity: string) {
    const source = this.#state.authoring
    return source?.identity === identity && source.member?.id ? this.#commentDrafts.get(identity, source.member.id) : undefined
  }
  /** A status counter only: passive client reports never enumerate or serialize drafts. */
  authoringCommentDraftRevision(): number {
    const source = this.#state.authoring
    return source?.identity && source.member?.id ? this.#commentDrafts.peek(source.identity, source.member.id)?.revision ?? 0 : 0
  }
  documentPropertyDrafts(identity: string): ComponentPropertyDrafts | undefined { return this.#state.authoring?.identity === identity ? this.#componentPropertyDrafts : undefined }
  /** Only counters enter passive client state; no new form payload is exposed to MCP. */
  authoringDraftRevision(): string {
    const source = this.#state.authoring
    return JSON.stringify([this.#documentSession.bodyDraftRevision(), this.authoringCommentDraftRevision(), source?.identity && source.member?.id ? this.#componentPropertyDrafts.revision(source.identity, source.member.id) : 0, this.#clientControlRevision])
  }
  subscribeAuthoringDraftChanges(listener: () => void): () => void {
    const comments = this.#commentDrafts.subscribe(listener), properties = this.#componentPropertyDrafts.subscribe(listener)
    this.#clientControlListeners.add(listener)
    return () => { comments(); properties(); this.#clientControlListeners.delete(listener) }
  }

  registerAuthoringClientControls(controls: AuthoringClientControls): () => void {
    this.#clientControls.add(controls); this.refreshAuthoringClientControls()
    return () => { this.#clientControls.delete(controls); this.refreshAuthoringClientControls() }
  }
  refreshAuthoringClientControls(): void {
    this.#clientControlRevision++
    for (const listener of this.#clientControlListeners) listener()
  }
  /** A mounted native form owns any input/transaction that cannot safely leave its view. */
  registerNavigationGuard(blocked: () => boolean): () => void {
    this.#navigationGuards.add(blocked); this.refreshAuthoringClientControls()
    return () => { this.#navigationGuards.delete(blocked); this.refreshAuthoringClientControls() }
  }
  waitForAuthoringClientState(ready: () => boolean, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: unknown) => { stop(); stopControls(); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve() }
      const check = () => { try { signal.throwIfAborted(); if (ready()) finish() } catch (error) { finish(error) } }
      const aborted = () => finish(signal.reason ?? new Error('client-request-expired'))
      const stop = this.subscribe(check), stopControls = this.subscribeAuthoringDraftChanges(check)
      signal.addEventListener('abort', aborted, { once: true })
      check()
    })
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

  /** Settings changed without changing document content; open voice surfaces read fresh capabilities. */
  refreshVoiceServices(): void {
    this.stopAuditions()
    this.#set({ voiceServiceVersion: (this.#state.voiceServiceVersion ?? 0) + 1 })
  }

  /** The host's way to hand a request to the conversation's agent. */
  onAgentRequest = (asker: (request: AgentRequest) => Promise<AgentAnswer | void>): (() => void) => {
    this.#askers.add(asker)
    return () => this.#askers.delete(asker)
  }

  /** The host's way to put a request in the conversation's composer for the author to finish; nothing is sent. */
  onAgentDraft = (drafter: (draft: AgentDraft) => void | Promise<void>): (() => void) => {
    this.#drafters.add(drafter)
    return () => this.#drafters.delete(drafter)
  }

  #nextDocumentPosition(): string { return `${this.#positionSeed}:${++this.#positionSequence}` }

  #restoredDocumentPosition(source: DocumentSessionState): boolean {
    const removed = this.#removedDocumentPosition
    if (!removed) return false
    if (removed.scope !== this.#documentScope || removed.generation !== this.editing.generation || removed.token !== this.#state.documentPositionToken
      || removed.identity !== source.identity || this.#state.documentPositionFailure !== 'removed' || source.error) {
      this.#removedDocumentPosition = undefined
      return false
    }
    const section = source.content?.sections[removed.sectionId]
    return !source.loading && !source.dirty && !source.saving && !source.restored && !source.composing && !source.recovering
      && source.version === removed.version && source.fingerprint === removed.fingerprint && source.content?.id === removed.documentId
      && Boolean(section && source.content?.sectionOrder.includes(removed.sectionId)
        && (!removed.stepId || section.stepOrder.includes(removed.stepId) && source.content.steps[removed.stepId]?.sectionId === removed.sectionId))
  }

  #set(patch: Partial<WorkbenchState>): void {
    if (Object.hasOwn(patch, 'position') || Object.hasOwn(patch, 'documentPositionFailure')) this.#removedDocumentPosition = undefined
    if (Object.hasOwn(patch, 'position')) this.editing.beforePosition()
    this.#state = { ...this.#state, ...patch, ...Object.hasOwn(patch, 'position') ? { documentPositionToken: this.#nextDocumentPosition(), documentPositionIntent: patch.documentPositionIntent ?? 'seek' } : {} }
    if (Object.hasOwn(patch, 'position')) this.editing.saveReturnPoint()
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

  planDocumentOperation(operation: ProjectOperation): Promise<ProjectPlan> {
    return this.client.planProjectChange({ id: randomUUID(), operation })
  }

  operateDocument(operation: ProjectOperation, planned?: ProjectPlan): Promise<OperationAnswer> {
    const attributes = Object.fromEntries(Object.entries(operation).filter(([, value]) => typeof value === 'string').map(([key, value]) => [`presmium.op.${key}`, value as string]))
    return this.#timed(`document.${operation.op}`, attributes, async () => {
      const scope = this.#documentScope
      if (this.#state.document === operation.dir) await this.flushPendingEdits()
      const answer = await this.client.operateDocument(operation, planned)
      if ((operation.op === 'rename' || operation.op === 'delete') && scope === this.#documentScope && this.#state.document === operation.dir) this.closeDocument()
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
    const answer = await this.operateDocument({ op: 'copy', dir, to, title })
    return answer.dir ?? to
  }

  /** Title changes use the same fixed project plan as directory management. */
  async retitleDocument(dir: string, title: string): Promise<void> {
    await this.operateDocument({ op: 'retitle', dir, title })
  }

  async openDocument(dir: string, options: { focus?: 'body', expectedIdentity?: string, fallbackReturnPoint?: DocumentReturnPoint, signal?: AbortSignal } = {}): Promise<void> {
    if (this.#state.document === dir) {
      if (options.focus) { this.editing.beginOpening(dir, options.focus); this.editing.finishOpening() }
      return
    }
    this.editing.saveReturnPoint()
    this.#documentScope++
    const scope = this.#documentScope
    this.#stopSubscriptions()
    this.#history.subscribeReview(dir)
    this.#set({ ...DOCUMENT_RESET, document: dir, previewRenderer: 'web', webView: 'document' })
    this.editing.beginOpening(dir, options.focus, options.fallbackReturnPoint)
    this.#record('document.open')
    this.#diagnostics.subscribe(dir)
    // Authoring is ready from source JSON; compilation and preview are independent.
    const [opened] = await Promise.all([this.#documentSession.open(dir, options.expectedIdentity, options.signal), this.#readFocus(dir, options.signal), this.#history.read(dir, options.signal)])
    if (opened === 'identity-changed' && scope === this.#documentScope && this.#state.document === dir) { this.closeDocument(); return }
    if (scope === this.#documentScope && this.#state.document === dir) this.editing.finishOpening()
  }

  closeDocument(): void {
    this.editing.saveReturnPoint()
    this.#documentScope++
    if (this.#state.document !== undefined) this.#record('document.close')
    this.#stopSubscriptions()
    this.#documentSession.close()
    this.#set({ ...DOCUMENT_RESET, document: undefined })
    void this.loadDocuments()
  }

  async #readFocus(dir: string, signal?: AbortSignal): Promise<void> {
    const version = this.#focusVersion
    try {
      const answer = await this.client.readFocus(dir, signal)
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
      const preview = await readPreviewWhenReady(this.client, dir, renderer, { waiting: current })
      if (current()) this.#set({ preview, previewFailure: undefined })
    } catch (error) {
      if (current()) this.#set({ previewFailure: error instanceof Error && error.name === 'TimeoutError' ? 'preview-timeout' : errorMessage(error) })
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

  /** Only public modal semantics are inspected; no field values or editor selection are read. */
  #previewModalOpen(): boolean {
    return typeof document !== 'undefined' && [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
      .some(element => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
  }

  #canPreparePresentation(owned = false): boolean {
    const state = this.#state, source = state.authoring
    return Boolean(state.document !== undefined && source?.identity && source.version && source.fingerprint && source.content
      && !source.loading && !source.dirty && !source.saving && !source.restored && !source.error && !source.composing && !source.recovering
      && !state.hasDocumentTimingDrafts && !state.documentTimingDraftStorageFailure && !state.isCreatingPage && !state.isEditingPage
      && !state.isHistoryBusy && !state.isHistoryPreparing && !state.jobPreparing && !state.isBundleDisabled && !isAgentChanging(state)
      && (owned || !state.isPreparingPresentation) && !this.#previewModalOpen())
  }

  /** One explicit preparation owner; caller cancellation stops adoption without changing the current mode. */
  async preparePresentation(signal?: AbortSignal, deadline?: number): Promise<boolean> {
    const directory = this.#state.document, source = this.#state.authoring
    if (!this.#canPreparePresentation() || directory === undefined || !source?.identity || !source.version || !source.fingerprint || !source.content) {
      this.#set({ presentationFailure: this.#state.hasDocumentTimingDrafts ? this.#messages.timingDraftPending : this.#messages.presentationPending })
      return false
    }
    signal?.throwIfAborted()
    this.#presentationController?.abort(new Error('presentation-superseded'))
    const request = ++this.#presentationPreparation, scope = this.#documentScope
    const controller = this.#presentationController = new AbortController()
    const cancel = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', cancel, { once: true })
    const { identity, version, fingerprint } = source, project = source.projectRevision ?? 0
    const current = () => request === this.#presentationPreparation && scope === this.#documentScope && this.#state.document === directory && this.#state.authoring?.identity === identity
    const unchanged = () => {
      const latest = this.#state.authoring
      return current() && !controller.signal.aborted && (deadline === undefined || Date.now() < deadline) && this.#canPreparePresentation(true)
        && latest?.version === version && latest.fingerprint === fingerprint && (latest.projectRevision ?? 0) === project
    }
    this.#set({ isPreparingPresentation: true, presentationFailure: undefined })
    const timeout = setTimeout(() => controller.abort(deadline === undefined ? new DOMException('Presentation preparation timed out', 'TimeoutError') : new Error('client-request-expired')), Math.max(0, Math.min(this.#preparationTimeoutMs, deadline === undefined ? this.#preparationTimeoutMs : deadline - Date.now())))
    const stop = this.subscribe(() => { if (!unchanged()) controller.abort(new Error('presentation-source-changed')) })
    const input = () => controller.abort(new Error('client-preview-input'))
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') controller.abort(new Error('client-preview-cancelled')) }
    const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => { if (this.#previewModalOpen()) controller.abort(new Error('client-preview-modal-open')) })
    if (typeof document !== 'undefined') {
      document.addEventListener('beforeinput', input, true); document.addEventListener('compositionstart', input, true); document.addEventListener('keydown', escape, true)
      observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden', 'inert'] })
    }
    try {
      await waitForPreviewRequest(this.pausePlayback(), controller.signal)
      if (!unchanged()) return false
      controller.signal.throwIfAborted()
      const snapshot = await compileDocumentPreview(this.client, { directory, version, fingerprint, project }, controller.signal)
      controller.signal.throwIfAborted()
      const ir = snapshot.ir
      if (!current()) return false
      const entry = directory ? `${directory}/lecture.json` : 'lecture.json'
      if (!unchanged() || ir.revision !== snapshot.revision || ir.sourceFingerprints?.[entry] !== fingerprint
        || ir.doc.source?.version !== version || ir.doc.source.fingerprint !== fingerprint) throw new Error('presentation-source-changed')
      if (ir.diagnostics.some(finding => finding.severity === 'error')) throw new Error('document-preview-compile-failed')
      this.#set({ ir, preview: snapshot.preview, previewRenderer: 'web', previewFailure: undefined, presentationSnapshot: { version, fingerprint, revision: ir.revision, project } })
      return true
    } catch (error) {
      // Editing supersedes this snapshot; the existing stale status owns its recovery action.
      const cancelled = controller.signal.aborted && !(controller.signal.reason instanceof Error && controller.signal.reason.name === 'TimeoutError')
      if (current()) this.#set({ presentationFailure: cancelled || error instanceof Error && error.message === 'presentation-source-changed' ? undefined : this.#messages.presentationCompileFailed })
      return false
    } finally {
      clearTimeout(timeout); stop(); signal?.removeEventListener('abort', cancel); observer?.disconnect()
      if (typeof document !== 'undefined') { document.removeEventListener('beforeinput', input, true); document.removeEventListener('compositionstart', input, true); document.removeEventListener('keydown', escape, true) }
      if (this.#presentationController === controller) this.#presentationController = undefined
      if (current()) this.#set({ isPreparingPresentation: false })
    }
  }

  /** Closing an explicit preview cancels its pending adoption, while source saves retain their owner. */
  cancelPreviewPreparation(): void {
    if (!this.#state.isPreparingPresentation) return
    this.#presentationController?.abort(new Error('client-preview-cancelled'))
    this.#presentationPreparation++
    this.#set({ isPreparingPresentation: false, presentationFailure: undefined })
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
    const runtime = document !== undefined && !jobs && (this.#previewObservers.size > 0 || this.#state.webView === 'present' || this.#state.previewRenderer === 'slides')
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

  /** A visible reader or presentation shares the existing optional IR stream. */
  observePreviewRuntime(): () => void {
    const token = Symbol('preview')
    this.#previewObservers.add(token)
    this.#syncRuntimeStreams()
    return () => { if (this.#previewObservers.delete(token)) this.#syncRuntimeStreams() }
  }

  /** Follows export status only while a consumer is visible; it displaces the optional IR stream. */
  observeJobs(): () => void {
    const token = Symbol('exports')
    this.#jobObservers.add(token)
    this.#syncRuntimeStreams()
    if (this.#state.document !== undefined) void this.#readIr(this.#state.document)
    return () => { if (this.#jobObservers.delete(token)) this.#syncRuntimeStreams() }
  }

  /** Space and the left and right arrows pressed in a preview that the workbench plays (Video Production's). */
  observePlaybackKeys(listener: (command: PlaybackKey) => void): () => void {
    this.#playbackKeys.add(listener)
    return () => { this.#playbackKeys.delete(listener) }
  }

  /** Video and its dialogs borrow one owner; its idle reads never prepare a snapshot or stop media. */
  observeVoiceoverJobs(): () => void {
    return this.#state.document === undefined ? () => {} : this.#voiceover.observe(this.#state.document)
  }

  rememberVoiceoverJob(document: string, job: VoiceoverJob): void { this.#voiceover.remember(document, job) }

  #voiceoverPlaybackCurrent(job: VoiceoverJob): boolean {
    const state = this.#state, snapshot = state.presentationSnapshot, binding = state.productionPlan?.binding
    return Boolean(binding && this.#productionSourceCurrent(binding) && sameSource(binding.source, job.source) && binding.irRevision === job.revision
      && snapshot?.version === job.source.version && snapshot.fingerprint === job.source.fingerprint && snapshot.revision === job.revision
      && snapshot.project === (state.authoring?.projectRevision ?? 0) && state.previewIrRevision === job.revision
      && state.webView === 'present' && state.previewRenderer === 'web' && state.preview?.web && !state.isPreparingPresentation
      && !state.hasDocumentTimingDrafts && !state.documentTimingDraftStorageFailure && !documentRecordingActive(this))
  }

  async #refreshVoiceover(job: VoiceoverJob, signal: AbortSignal): Promise<boolean> {
    if (!this.#voiceoverPlaybackCurrent(job)) return false
    const document = this.#state.document!, scope = this.#documentScope, identity = this.#state.authoring?.identity, initialBinding = this.#state.productionPlan!.binding
    // This is the existing cache-only plan read: no compile, discovery, generation or draft flush.
    const plan = await this.client.readProductionPlan(document, { source: job.source, irRevision: job.revision }, signal)
    signal.throwIfAborted()
    const current = () => scope === this.#documentScope && identity === this.#state.authoring?.identity && this.#voiceoverPlaybackCurrent(job)
      && Boolean(this.#state.productionPlan && sameProductionBinding(initialBinding, this.#state.productionPlan.binding))
    if (!current()) return false
    if (!sameSource(plan.binding.source, job.source) || plan.binding.irRevision !== job.revision) throw new Error('voice-context-changed')
    if (sameProductionBinding(plan.binding, this.#state.productionPlan!.binding)) return true
    this.#playback.stopPreviewOutputs()
    await this.pausePlayback()
    signal.throwIfAborted()
    if (!current()) return false
    this.#productionPlayback.reset()
    this.#set({ productionPlan: plan, voiceoverCacheRefresh: { source: job.source, revision: job.revision, sequence: (this.#state.voiceoverCacheRefresh?.sequence ?? 0) + 1 } })
    // The mounted production loader fetches this new binding in the existing frame.
    // Replacing the iframe for every clip would interrupt progressive playback and its connection.
    return true
  }

  #showWebView(sinks: Iterable<PreviewSink> = this.#previewSinks): void {
    const selected = this.#state.position
    const section = selected?.section ?? this.#state.ir?.doc.sections[0]?.id ?? this.#state.authoring?.content?.sectionOrder[0]
    if (section === undefined) return
    // A fresh or reloaded frame reports its initial document view before applying this command.
    this.#awaitingView = this.#state.webView
    for (const sink of sinks) sink.send({ type: 'go', section, step: selected?.step ?? 0, view: this.#state.webView })
  }

  reloadPreview(): void {
    this.#record('preview.reload')
    this.#reloadPreview()
  }

  /** New exact audio caches can refresh an existing current preview, without compiling or starting playback. */
  refreshVoicePlayback(source: CanonicalSource, revision: string): boolean {
    const state = this.#state, authoring = state.authoring, snapshot = state.presentationSnapshot
    if (!authoring || authoring.content?.id !== source.documentId || authoring.version !== source.version || authoring.fingerprint !== source.fingerprint
      || authoring.loading || authoring.dirty || authoring.saving || authoring.composing || authoring.restored || authoring.error
      || !snapshot || snapshot.version !== source.version || snapshot.fingerprint !== source.fingerprint || snapshot.revision !== revision
      || snapshot.project !== (authoring.projectRevision ?? 0) || state.webView !== 'present' || state.previewRenderer !== 'web' || !state.preview?.web) return false
    this.#reloadPreview()
    return true
  }

  #productionSourceCurrent(binding: ProductionBinding): boolean {
    const source = this.#state.authoring
    return Boolean(source?.content?.id === binding.source.documentId && source.version === binding.source.version && source.fingerprint === binding.source.fingerprint
      && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error && !isAgentChanging(this.#state))
  }

  #productionReady(): boolean {
    const state = this.#state, binding = state.productionPlan?.binding, snapshot = state.presentationSnapshot
    return Boolean(binding && this.#productionSourceCurrent(binding) && snapshot?.revision === binding.irRevision
      && snapshot.version === binding.source.version && snapshot.fingerprint === binding.source.fingerprint && snapshot.project === (state.authoring?.projectRevision ?? 0)
      && state.previewIrRevision === binding.irRevision && state.webView === 'present' && state.previewRenderer === 'web'
      && !state.hasDocumentTimingDrafts && !state.documentTimingDraftStorageFailure)
  }

  /** Home is distinct from the root document, whose directory is the empty string. */
  authoringWindowSnapshot(revision: number): AuthoringWindowSnapshot {
    const state = this.#state, source = state.authoring
    const recording = this.authoringClientSnapshot(0)?.recording
    const guarded = !isAgentChanging(state) && !source?.composing && !source?.recovering && !state.isCreatingPage && !state.isEditingPage
      && !state.isHistoryBusy && !state.isHistoryPreparing && !state.isPreparingPresentation && !state.hasDocumentTimingDrafts
      && !this.#documentSession.hasPendingAssetWrite() && ![...this.#navigationGuards].some(blocked => blocked())
      && !this.#previewModalOpen() && !(recording && (['requesting', 'recording', 'stopping'].includes(recording.phase) || recording.candidate && !recording.candidate.assetId))
    return { revision, location: state.document === undefined ? { type: 'home' } : { type: 'document', document: state.document,
      ...source?.directory === state.document && source.content ? { documentId: source.content.id } : {},
      status: source?.directory !== state.document || source.loading ? 'loading' : source.content ? 'ready' : 'failed' },
      actions: ['window.read', ...guarded ? ['document.open' as const, 'document.close' as const] : []] }
  }

  /** Uses the same native navigation and retained document actors; it never implicitly saves or discards. */
  async executeAuthoringWindowAction(request: AuthoringWindowRequest, signal: AbortSignal): Promise<AuthoringWindowRequestResult['outcome']> {
    const action = request.action
    signal.throwIfAborted()
    if (action.type === 'window.read') return 'observed'
    const scope = this.#documentScope, content = this.#state.authoring?.content, identity = this.#state.authoring?.identity,
      drafts = this.authoringDraftRevision(), view = this.#state.webView, playback = this.#state.productionNavigationVersion
    const guard = () => {
      signal.throwIfAborted()
      if (scope !== this.#documentScope || identity !== this.#state.authoring?.identity || content !== this.#state.authoring?.content || drafts !== this.authoringDraftRevision()
        || view !== this.#state.webView || playback !== this.#state.productionNavigationVersion || !this.authoringWindowSnapshot(0).actions.includes(action.type)) throw new Error('window-state-changed')
    }
    guard()
    await waitForPreviewRequest(this.pausePlayback(), signal)
    guard(); this.stopAuditions()
    if (action.type === 'document.close') {
      if (this.#state.document === undefined) return 'unchanged'
      this.closeDocument(); return 'closed'
    }
    const target = request.target
    if (!target || target.document !== action.document) throw new Error('window-target-changed')
    const [answer, info] = await waitForPreviewRequest(Promise.all([this.client.readDocument(target.document, signal), this.client.readWorkbenchInfo()]), signal)
    guard()
    if (answer.document !== target.document || answer.content.id !== target.documentId || !info.root) throw new Error('window-target-changed')
    if (this.#state.document === target.document && this.#state.authoring?.content?.id === target.documentId) return 'unchanged'
    let navigationScope: number | undefined
    const cancel = () => {
      // A later human navigation owns its own scope. Never roll that view back.
      if (navigationScope !== undefined && navigationScope === this.#documentScope && this.#state.document === target.document
        && (this.#state.authoring?.loading || !this.#state.authoring?.content)) this.closeDocument()
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const opening = this.openDocument(target.document, { expectedIdentity: JSON.stringify([info.root, target.documentId]), signal })
      navigationScope = this.#documentScope
      await waitForPreviewRequest(opening, signal)
      signal.throwIfAborted()
      const location = this.authoringWindowSnapshot(0).location
      if (navigationScope !== this.#documentScope || location.type !== 'document' || location.document !== target.document || location.documentId !== target.documentId
        || location.status !== 'ready' || this.#state.authoring?.error) throw new Error('window-target-not-verified')
      return 'opened'
    } finally { signal.removeEventListener('abort', cancel) }
  }

  /** Bounded observations, without reading or publishing any unsubmitted editor content. */
  authoringClientSnapshot(revision: number): AuthoringClientSnapshot | undefined {
    const state = this.#state, source = state.authoring, content = source?.content
    if (state.document === undefined || !content || !source?.identity || !source.version || !source.fingerprint) return undefined
    const locked = isAgentChanging(state), conflicted = Boolean(source.error || source.restored || source.recovering)
    const editing = { dirty: source.dirty, saving: source.saving, composing: source.composing, conflicted, locked, loading: source.loading }
    const safe = !source.loading && !source.composing && !conflicted && !locked && !state.isCreatingPage && !state.isEditingPage
    const clean = safe && !source.dirty && !source.saving && !state.hasDocumentTimingDrafts
    const plan = state.productionPlan, playback = state.productionPlayback
    const ready = clean && plan?.canPreview && this.#productionReady() && playback?.status === 'ready' && sameProductionBinding(plan.binding, playback.binding)
    const position = state.position, page = position && content.sections[position.section]
    const bodyDrafts = this.#documentSession.bodyDraftCapabilities()
    const commentDrafts = source.member?.id ? this.#commentDrafts.peek(source.identity, source.member.id) : undefined
    const prepared = state.presentationSnapshot, actual = this.#documentSession.canonicalSource() ?? { documentId: content.id, version: source.version, fingerprint: source.fingerprint }
    const preparedCurrent = clean && prepared && prepared.version === source.version && prepared.fingerprint === source.fingerprint && prepared.project === (source.projectRevision ?? 0)
      && state.ir?.revision === prepared.revision && state.ir.doc.source?.version === source.version && state.ir.doc.source.fingerprint === source.fingerprint
    const controls = [...this.#clientControls].filter(owner => owner.identity === source.identity)
    const advertised = controls.flatMap(owner => owner.actions()), unique = advertised.filter((type, index) => advertised.indexOf(type) === index && advertised.lastIndexOf(type) === index)
    const reported = controls.map(owner => owner.snapshot?.()).filter(value => value !== undefined)
    const mode = reported.find(value => value.mode)?.mode, recording = reported.find(value => value.recording)?.recording
    return { revision, source: actual, view: state.webView, editing,
      ...mode ? { mode } : {}, ...recording ? { recording } : {},
      interaction: state.documentPositionToken,
      ...page && position ? { position: { sectionId: page.id, ...page.stepOrder[position.step] ? { stepId: page.stepOrder[position.step] } : {} } } : {},
      ...plan ? { binding: plan.binding } : {}, ...playback ? { playback } : {},
      preview: preparedCurrent ? { status: 'prepared', source: actual, irRevision: prepared.revision, projectRevision: prepared.project }
        : { status: state.isPreparingPresentation ? 'preparing' : state.presentationFailure ? 'unavailable' : 'unprepared' },
      actions: ['state.read', 'playback.pause', ...safe ? ['source.flush' as const] : [],
        ...safe && state.mode === 'editing' && state.editorHistory?.undo ? ['native-history.undo' as const] : [],
        ...safe && state.mode === 'editing' && state.editorHistory?.redo ? ['native-history.redo' as const] : [],
        ...unique,
        ...bodyDrafts.read ? ['body-drafts.inspect' as const, 'body-drafts.read' as const] : [],
        ...bodyDrafts.mutate && !locked && !state.isCreatingPage && !state.isEditingPage && !state.isHistoryBusy && !state.isHistoryPreparing && !state.hasDocumentTimingDrafts
          ? ['body-drafts.restore' as const, 'body-drafts.discard' as const, ...bodyDrafts.current ? ['body-drafts.retry' as const] : []] : [],
        ...commentDrafts?.readable ? ['comment-drafts.inspect' as const, 'comment-drafts.read' as const] : [],
        ...clean && !state.isHistoryBusy && !state.isHistoryPreparing && commentDrafts?.readable && commentDrafts.ownersKnown ? ['comment-drafts.discard' as const, ...state.webView === 'document' && commentDrafts.hasRestoreComposer() ? ['comment-drafts.restore' as const] : []] : [],
        ...source.member?.id && this.#componentPropertyDrafts.readable(source.identity, source.member.id) ? ['component-drafts.inspect' as const, 'component-drafts.read' as const] : [],
        ...clean && !state.isHistoryBusy && !state.isHistoryPreparing && source.member?.id && this.#componentPropertyDrafts.readable(source.identity, source.member.id) ? ['component-drafts.restore' as const, 'component-drafts.discard' as const] : [],
        ...this.#canPreparePresentation() ? ['preview.prepare' as const] : [],
        ...clean && (state.webView === 'document' || ready) ? ['position.step' as const] : [],
        ...ready ? ['playback.play' as const, 'playback.rate' as const, ...plan?.timing === 'confirmed' ? ['playback.seek' as const] : []] : []], unsubmittedContent: 'not-inspected' }
  }

  /** Reuses the same source actor, mutual-audio gate and frame acknowledgements as the human controls. */
  async executeAuthoringClientAction(action: AuthoringClientAction, expected: CanonicalSource, signal: AbortSignal, deadline?: number, fits?: (result: AuthoringClientActionResult) => boolean): Promise<void | AuthoringClientActionResult> {
    const scope = this.#documentScope, identity = this.#state.authoring?.identity, document = this.#state.document, interaction = this.#state.documentPositionToken
    const owned = () => { signal.throwIfAborted(); if (scope !== this.#documentScope || identity !== this.#state.authoring?.identity || document !== this.#state.document) throw new Error('client-document-changed') }
    const current = () => { owned(); const state = this.authoringClientSnapshot(0); if (!state || (action.type === 'body-drafts.retry' ? state.source.documentId !== expected.documentId : !sameSource(state.source, expected)) || !state.actions.includes(action.type)) throw new Error('client-action-unavailable'); return state }
    current()
    if (action.type === 'state.read') return
    if (action.type === 'native-history.undo' || action.type === 'native-history.redo') {
      if (this.editing.nativeHistory(action.type === 'native-history.undo' ? 'undo' : 'redo') !== true) throw new Error('client-native-history-unavailable')
      owned(); return
    }
    const controls = [...this.#clientControls].filter(owner => owner.identity === identity && owner.actions().includes(action.type))
    if (controls.length) {
      if (controls.length !== 1) throw new Error('client-action-ambiguous')
      const control = controls[0]!
      await control.execute(action, expected, signal, deadline)
      owned()
      if (!this.#clientControls.has(control)) throw new Error('client-action-unavailable')
      return
    }
    if (action.type === 'body-drafts.inspect' || action.type === 'body-drafts.read' || action.type === 'body-drafts.restore' || action.type === 'body-drafts.discard' || action.type === 'body-drafts.retry') {
      if (!identity || !fits) throw new Error('client-body-drafts-unavailable')
      const guard = () => {
        owned()
        const actual = this.#documentSession.canonicalSource()
        if (!actual || actual.documentId !== expected.documentId || action.type !== 'body-drafts.inspect' && action.type !== 'body-drafts.read' && isAgentChanging(this.#state)) throw new Error('client-source-changed')
      }
      return executeBodyDraftAction(this.#documentSession, () => this.#state.authoring, action, { signal, guard, source: expected, ...action.type !== 'body-drafts.retry' ? { localDraft: true as const } : {} }, fits)
    }
    if (action.type === 'comment-drafts.inspect' || action.type === 'comment-drafts.read') {
      const drafts = identity ? this.documentCommentDrafts(identity) : undefined
      if (!drafts?.readable || !fits) throw new Error('client-comment-drafts-unavailable')
      const result = await inspectCommentDrafts(drafts, action, signal, fits)
      current()
      return result
    }
    if (action.type === 'comment-drafts.restore' || action.type === 'comment-drafts.discard') {
      const memberId = this.#state.authoring?.member?.id, drafts = identity ? this.documentCommentDrafts(identity) : undefined
      if (!identity || !memberId || !drafts || !fits) throw new Error('client-comment-drafts-unavailable')
      const guard = () => {
        owned()
        const state = this.#state, source = state.authoring
        if (!source?.content || source.member?.id !== memberId || !source.version || !source.fingerprint
          || !sameSource({ documentId: source.content.id, version: source.version, fingerprint: source.fingerprint }, expected)
          || source.loading || source.dirty || source.saving || source.composing || source.restored || source.recovering || source.error || isAgentChanging(state)
          || state.isCreatingPage || state.isEditingPage || state.isHistoryBusy || state.isHistoryPreparing || state.hasDocumentTimingDrafts
          || action.type === 'comment-drafts.restore' && state.webView !== 'document') throw new Error('client-source-changed')
      }
      return mutateCommentDrafts(drafts, action, signal, guard, fits)
    }
    if (action.type === 'component-drafts.inspect' || action.type === 'component-drafts.read') {
      const memberId = this.#state.authoring?.member?.id
      if (!identity || !memberId || !fits || !this.#componentPropertyDrafts.readable(identity, memberId)) throw new Error('client-component-drafts-unavailable')
      const result = await inspectComponentDrafts(this.#componentPropertyDrafts, { identity, memberId, source: expected }, action, signal, fits)
      current()
      return result
    }
    if (action.type === 'component-drafts.restore' || action.type === 'component-drafts.discard') {
      const memberId = this.#state.authoring?.member?.id
      if (!identity || !memberId || !fits) throw new Error('client-component-drafts-unavailable')
      const guard = (draft?: ComponentPropertyDraft) => {
        owned()
        const state = this.#state, source = state.authoring
        if (!source?.content || source.identity !== identity || source.member?.id !== memberId || !source.version || !source.fingerprint
          || !sameSource({ documentId: source.content.id, version: source.version, fingerprint: source.fingerprint }, expected)
          || source.loading || source.dirty || source.saving || source.composing || source.restored || source.recovering || source.error || isAgentChanging(state)
          || state.isCreatingPage || state.isEditingPage || state.isHistoryBusy || state.isHistoryPreparing || state.hasDocumentTimingDrafts) throw new Error('client-source-changed')
        if (action.type === 'component-drafts.restore') {
          const block = source.content.blocks[action.draft.blockId]
          if (block?.type !== 'component' || draft && block.definitionId !== draft.definitionId) throw new Error('client-component-target-unavailable')
          // The source-bound bank checks the saved Definition again before adopting its strict fork.
          try { effectiveComponentParameters(source.content, block.id, action.draft.stepId) } catch { throw new Error('client-component-target-unavailable') }
        }
      }
      return mutateComponentDrafts(this.#componentPropertyDrafts, { identity, memberId, source: expected }, action, signal, guard, fits)
    }
    if (action.type === 'preview.prepare') {
      const view = this.#state.webView
      const stop = this.subscribe(() => { if (interaction !== this.#state.documentPositionToken || view !== this.#state.webView) this.cancelPreviewPreparation() })
      try {
        const prepared = await this.preparePresentation(signal, deadline)
        owned(); signal.throwIfAborted()
        const result = this.authoringClientSnapshot(0)
        if (!prepared || result?.preview?.status !== 'prepared' || !result.preview.source || !sameSource(result.preview.source, expected)
          || result.view !== view || result.interaction !== interaction) throw new Error('client-preview-unavailable')
      } finally { stop() }
      return
    }
    if (action.type === 'source.flush') {
      await this.flushPendingEdits(signal); owned()
      const source = this.#state.authoring
      if (!source || source.dirty || source.saving || source.composing || source.error || source.restored) throw new Error('client-source-not-saved')
      return
    }
    if (action.type === 'playback.pause') { this.#interruptProductionNavigation(); await this.pausePlayback(); owned(); return }
    if (action.type === 'position.step') {
      const content = this.#state.authoring?.content, section = content?.sections[action.sectionId]
      if (!section?.stepOrder.includes(action.stepId) || content?.steps[action.stepId]?.sectionId !== action.sectionId) throw new Error('client-step-not-found')
      await this.pausePlayback(); current()
      if (interaction !== this.#state.documentPositionToken) throw new Error('client-position-changed')
      const present = this.#state.webView === 'present'
      const result = await this.selectDocumentStep(action.sectionId, action.stepId)
      owned()
      const state = this.authoringClientSnapshot(0)
      if (!state || !sameSource(state.source, expected) || state.position?.sectionId !== action.sectionId || state.position.stepId !== action.stepId
        || present && (!result || result.status !== 'ready' || result.position?.sectionId !== action.sectionId || result.position.stepId !== action.stepId || result.position.playing)) throw new Error('client-step-unverified')
      return
    }
    if (action.type !== 'playback.play' && action.type !== 'playback.seek' && action.type !== 'playback.rate') throw new Error('client-action-unavailable')
    const plan = this.#state.productionPlan
    if (!plan || !sameProductionBinding(plan.binding, action.binding)) throw new Error('client-playback-binding-changed')
    if (action.type === 'playback.seek' && (plan.timing !== 'confirmed' || plan.durationMs === undefined || action.timeMs > plan.durationMs)) throw new Error('client-seek-out-of-range')
    if (action.type === 'playback.rate' && !(PRODUCTION_PLAYBACK_RATES as readonly number[]).includes(action.rate)) throw new Error('client-rate-unavailable')
    const control: ProductionPlaybackCommand = action.type === 'playback.play' ? { action: 'play', binding: action.binding }
      : action.type === 'playback.seek' ? { action: 'seek', binding: action.binding, timeMs: action.timeMs } : { action: 'rate', binding: action.binding, rate: action.rate }
    const result = await this.controlProduction(control, signal); owned()
    if (result.status !== 'ready' || !result.position || action.type === 'playback.play' && !result.position.playing
      || action.type === 'playback.rate' && result.position.rate !== action.rate) throw new Error('client-playback-unverified')
  }

  /** Reads the actual derived plan without building the visuals or synthesizing speech. */
  async prepareProductionPlan(signal: AbortSignal): Promise<ProductionPlan> {
    const initial = this.#state, source = initial.authoring, identity = source?.identity, directory = initial.document, scope = this.#documentScope
    if (!identity || directory === undefined || !source?.version || !source.fingerprint || source.loading || source.dirty || source.saving || source.composing || source.restored || source.error) throw new Error('production-source-changed')
    const snapshot = await readDocumentSnapshot(this.client, { directory, version: source.version, fingerprint: source.fingerprint }, signal)
    signal.throwIfAborted()
    if (!snapshot.doc.source || scope !== this.#documentScope || this.#state.authoring?.identity !== identity) throw new Error('production-source-changed')
    const plan = await this.client.readProductionPlan(directory, { source: snapshot.doc.source, irRevision: snapshot.revision }, signal)
    signal.throwIfAborted()
    if (scope !== this.#documentScope || this.#state.authoring?.identity !== identity || !this.#productionSourceCurrent(plan.binding)) throw new Error('production-source-changed')
    this.#set({ productionPlan: plan })
    if (this.#productionPlayback.changed()) void this.pausePlayback().catch(() => {})
    return plan
  }

  #interruptProductionNavigation(): void {
    this.#set({ productionNavigationVersion: this.#state.productionNavigationVersion + 1 })
  }

  /** The child confirms seeks and playback; the parent never estimates a playhead using a timer. */
  async controlProduction(control: ProductionPlaybackCommand, signal?: AbortSignal): Promise<ProductionPlaybackState> {
    if (control.action === 'pause' || control.action === 'seek' || control.action === 'step' && !control.utteranceId) this.#interruptProductionNavigation()
    if (control.action === 'seek' && this.#state.productionPlan?.timing !== 'confirmed') throw new Error('production-plan-unavailable')
    const scope = this.#documentScope
    this.#set({ productionFailure: undefined })
    try {
      if (control.action === 'play' || control.action === 'load' || control.action === 'seek' || control.action === 'step') {
        if (control.action === 'load') this.#playback.stopPreviewOutputs()
        else this.stopAuditions()
        await this.pausePlayback()
        signal?.throwIfAborted()
      }
      return await this.#productionPlayback.control(control, signal)
    } catch (error) {
      const code = errorMessage(error), current = this.#state.productionPlan?.binding
      if (scope === this.#documentScope && !signal?.aborted && current && sameProductionBinding(current, control.binding) && this.#productionReady()
        && !(control.action === 'load' && code === 'production-playback-cancelled')
        && !['production-source-changed', 'production-request-superseded', 'production-request-cancelled'].includes(code)) this.#set({ productionFailure: code })
      throw error
    }
  }

  closeProduction(): void {
    this.#interruptProductionNavigation()
    this.#productionPlayback.reset()
    this.#set({ productionPlan: undefined, productionFailure: undefined })
  }

  /** Explicitly enables the standard production capability in this document's one authoritative source. */
  async enableDocumentProduction(): Promise<void> {
    const scope = this.#documentScope, identity = this.#state.authoring?.identity
    if (!identity) throw new Error('production-source-changed')
    await this.pausePlayback()
    await this.flushPendingEdits()
    const source = this.#state.authoring, document = this.getDocument(identity)
    if (scope !== this.#documentScope || !document || !source?.version || !source.fingerprint || source.dirty || source.saving || source.composing || source.restored || source.error || isAgentChanging(this.#state)) throw new Error('production-source-changed')
    this.#documentSession.record(enableDocumentProduction(document))
    await this.flushPendingEdits()
    if (scope !== this.#documentScope || this.#state.authoring?.identity !== identity || this.#state.authoring.dirty || this.#state.authoring.saving || this.#state.authoring.error) throw new Error('production-source-changed')
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

  /** The preview acknowledges that all registered lecture playback has paused before audition audio starts. */
  pausePlayback(interactive = false): Promise<void> { if (interactive) this.#interruptProductionNavigation(); return this.#playback.pause() }

  /** The owner must invalidate pending audio responses as well as stop its current audio element. */
  registerAudition(stop: () => void): () => void { return this.#playback.registerAudition(stop) }
  registerAudioCapture(stop: () => void): () => void { this.#interruptProductionNavigation(); return this.#playback.registerAudioCapture(stop) }

  /** Inline runtimes join the same exclusive playback group as author auditions. */
  startDocumentPlayback(stop: () => Promise<void>): Promise<() => void> { this.#interruptProductionNavigation(); return this.#playback.startDocumentPlayback(stop) }

  stopAuditions(): void { this.#playback.stopAuditions() }

  /** The latest source actor value, scoped to the field/editor that captured its identity. */
  getDocument(identity?: string): TeachingDocument | undefined {
    const source = this.#state.authoring
    if (!source || source.loading || source.directory !== this.#state.document || identity !== undefined && identity !== source.identity) return undefined
    return source.content
  }
  /** Native image uploads commit the original file without interrupting later text input. */
  async importDocumentImage(file: File, identity: string, signal?: AbortSignal): Promise<string> {
    if (!this.getDocument(identity) || isAgentChanging(this.#state)) throw new Error('document-identity-changed')
    this.stopAuditions()
    await this.pausePlayback()
    await this.flushPendingEdits(signal)
    if (!this.getDocument(identity) || isAgentChanging(this.#state)) throw new Error('document-identity-changed')
    const answer = await this.#documentSession.importImage(file, identity, signal)
    signal?.throwIfAborted()
    const asset = this.getDocument(identity)?.assets[answer.assetId]
    if (!asset || asset.kind !== 'image' || asset.location !== answer.content.assets[answer.assetId]?.location) throw new Error('document-identity-changed')
    return asset.location
  }
  /** Parameter planning is an authoring read; it does not compile, change modes or write the document. */
  async planDocumentComponentAction(action: DocumentComponentAction, id: string, expected: { identity: string, version: string, fingerprint: string }, signal?: AbortSignal): Promise<DocumentAuthoringActionPlan> {
    const source = this.production.source(expected), scope = this.#documentScope
    if (!source.content || !source.fingerprint || source.fingerprint !== expected.fingerprint) throw new Error('component-source-changed')
    const request = { id, source: componentSource({ content: source.content, version: source.version!, fingerprint: source.fingerprint }), action: structuredClone(action) }
    const answer = await this.client.planDocumentAction(source.directory, request, signal)
    signal?.throwIfAborted()
    const current = this.production.source(expected)
    if (scope !== this.#documentScope || !current.content || !current.fingerprint || answer.document !== source.directory || answer.changeId !== id || answer.effect.kind !== 'component'
      || !sameComponentSource(answer.source, request.source) || JSON.stringify(answer.action) !== JSON.stringify(request.action)) throw new Error('component-source-changed')
    return answer
  }
  /** The existing source actor owns adoption and ambiguous-response recovery, including later native input. */
  async applyDocumentComponentPlan(plan: DocumentAuthoringActionPlan, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<{ answer: DocumentChangeAnswer, commitId?: string }> {
    if (plan.effect.kind !== 'component' || !plan.action.type.startsWith('component.')) throw new Error('component-plan-invalid')
    const source = this.production.source(expected), action = plan.action as DocumentComponentAction, scope = this.#documentScope
    if (!source.content || !source.fingerprint || !sameComponentSource(plan.source, componentSource({ content: source.content, version: source.version!, fingerprint: source.fingerprint }))) throw new Error('component-source-changed')
    this.#playback.stopPreviewOutputs()
    await this.pausePlayback()
    let receipt: AppliedDocumentAuthoringAction | undefined
    const remember = (answer: DocumentChangeAnswer) => {
      this.editing.rememberComponent(answer.content, expected.identity)
      return { answer, ...receipt?.commit ? { commitId: receipt.commit.id } : {} }
    }
    try {
      const answer = await this.#documentSession.commitExternal(expected, async (_before, ownedSignal) => {
        receipt = await this.client.applyDocumentAction(source.directory, { planId: plan.planId, digest: plan.digest, source: plan.source }, ownedSignal)
        const current = await this.client.readDocument(source.directory)
        if (receipt.planId !== plan.planId || receipt.digest !== plan.digest || receipt.changeId !== plan.changeId || receipt.action !== plan.action.type
          || !receipt.verification.saved || !receipt.verification.actionStateVerified || !sameComponentSource(receipt.verification.source, componentSource(current))) throw new Error('document-confirmation')
        return { ...current, changeId: receipt.changeId, files: receipt.files }
      }, (before, answer, current) => reconcileComponentAction(action, before, answer, current), signal)
      if (scope !== this.#documentScope || this.#state.authoring?.identity !== expected.identity) throw new Error('component-source-changed')
      return remember(answer)
    } catch (error) {
      const current = this.#state.authoring, file = plan.files.find(value => value.path === (source.directory ? `${source.directory}/lecture.json` : 'lecture.json'))
      // commitExternal has independently read and reconciled this exact predicted canonical version.
      if (scope === this.#documentScope && current?.identity === expected.identity && current.content && current.version && current.fingerprint && !current.error
        && file?.version === current.version && current.version !== plan.source.version) {
        // Canonical acceptance is already known even when later native input has
        // deleted the target. Undoing that deletion must restore its accepted configuration.
        this.editing.rememberComponent(plan.content, expected.identity)
        try {
          if (!applyDocumentComponentAction(current.content, action).effect.changed) return remember({ document: source.directory, content: plan.content,
            version: current.version, fingerprint: current.fingerprint, issues: plan.issues, changeId: plan.changeId, files: plan.files.map(value => ({ path: value.path, version: value.version })) })
        } catch { /* A later conflicting input keeps the original request failure and form draft. */ }
      }
      throw error
    }
  }
  recordDocument(content: TeachingDocument): void { if (!isAgentChanging(this.#state)) this.#documentSession.record(content) }
  documentComposition(composing: boolean, owner = 'body', identity?: string): void { this.#documentSession.composition(composing, owner, identity) }
  retryDocument(): Promise<void> { return this.#documentSession.retry() }
  discardDocument(): Promise<void> { return this.#documentSession.discard().then(() => {}) }
  recoverDocumentDraft(value: DocumentDraftReference, identity: string): Promise<void> {
    return this.#state.authoring?.identity === identity && !isAgentChanging(this.#state) ? this.#documentSession.recoverDraft(value).then(() => {}) : Promise.resolve()
  }
  forgetDocumentDraft(value: DocumentDraftReference, identity: string): void {
    if (this.#state.authoring?.identity === identity && !isAgentChanging(this.#state)) void this.#documentSession.forgetDraft(value)
  }
  documentError(error: Error): void { this.#set({ save: { kind: 'failed', message: error.message } }) }
  async flushPendingEdits(signal?: AbortSignal): Promise<void> {
    if (isAgentChanging(this.#state)) throw new Error('save-locked')
    await this.#documentSession.flush(signal)
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
    if (document === undefined) return false
    // The request's id joins the operation to the conversation: the session's user message carries it, and its turn follows.
    const asked = (attributes: Record<string, OperationValue>) => this.#record('agent.ask', { 'presmium.ask.kind': kind, 'presmium.focus': focus.map(item => [item.id, item.section, item.block].filter(Boolean).join(':')).join('\n'), ...attributes })
    if (!asker) {
      asked({ 'presmium.outcome': 'no-conversation' })
      this.#set({ askFailure: 'no-conversation' })
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

  /**
   * Opens the conversation with a request, for the author to describe and send, to add an animation at `place` of the
   * open document; the document's focus points the AI at the place's block. Nothing is inserted or sent.
   */
  draftAnimation(place: DocumentInsertionPlace): boolean {
    const document = this.#state.document, content = this.#state.authoring?.content, drafter = [...this.#drafters][0]
    const section = content?.sections[place.sectionId]
    if (document === undefined || !content || !section || !drafter) return false
    const report = (block?: string): FocusReport => ({ id: 'insertion', from: this.#state.previewRenderer, section: place.sectionId, ...block ? { block } : {}, ...place.text ? { quote: place.text.slice(0, 2000) } : {} })
    const text = this.#messages.animationRequest(content.sectionOrder.indexOf(place.sectionId) + 1, section.title, place)
    const focus = [report(place.blocks[0])]
    void this.#focusFirst(document, [...place.blocks.map(block => [report(block)]), [report()], []])
    const drafted = (attributes: Record<string, OperationValue>) => this.#record('agent.draft', { 'presmium.ask.kind': 'animation', 'presmium.ask.text': text, 'presmium.section': place.sectionId, 'presmium.block': place.blocks[0], ...attributes })
    this.#set({ askFailure: undefined })
    void (async () => drafter({ text, focus }))().then(() => drafted({ 'presmium.outcome': 'drafted' }), (error: unknown) => {
      drafted({ 'presmium.outcome': 'failed', 'presmium.error': errorMessage(error) })
      if (this.#state.document === document) this.#set({ askFailure: errorMessage(error) })
    })
    return true
  }

  /**
   * Sets the first of `choices` the service can locate as the document's focus. Its runtime snapshot is compiled from the
   * saved source, which may not have a block or page created moments ago yet; the last choice leaves no stale focus.
   */
  async #focusFirst(document: string, choices: FocusReport[][]): Promise<void> {
    for (const focus of choices) {
      this.setFocus(focus)
      const version = this.#focusVersion
      await this.#focusWriting
      if (version !== this.#focusVersion || this.#state.document !== document || !this.#state.focusFailure) return
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
      this.#set({ position: { section, step: 0, trail: [], view: 'document' }, documentPositionFailure: undefined, documentNavigation: { section, request: randomUUID() } }); return
    }
    this.goToStep(section, this.#selectedSteps.get(`${this.#state.document}\0${section}`) ?? 0)
  }

  /** Material references locate a canonical block in Doc without entering a runtime view or rewriting selection. */
  revealDocumentComponent(blockId: string, identity: string): void {
    const source = this.#state.authoring, document = this.getDocument(identity)
    if (!document || source?.identity !== identity || this.#state.webView !== 'document' || document.blocks[blockId]?.type !== 'component') return
    const sectionId = documentComponentSection(document, blockId), section = document.sections[sectionId]!
    const current = this.#state.position?.section === sectionId ? this.#state.position.step : this.#selectedSteps.get(`${this.#state.document}\0${sectionId}`) ?? 0
    const visible = (index: number) => Boolean(section.stepOrder[index] && effectiveComponentParameters(document, blockId, section.stepOrder[index]).visual?.visible)
    const step = visible(current) ? current : Math.max(0, section.stepOrder.findIndex((_, index) => visible(index)))
    this.#set({ position: { section: sectionId, step, trail: [], view: 'document' }, documentPositionFailure: undefined,
      documentNavigation: { section: sectionId, block: blockId, request: randomUUID() } })
  }

  observeDocumentSection(section: string): void {
    if (this.#state.webView !== 'document' || !this.#state.authoring?.content?.sections[section]) return
    if (this.#state.documentPositionFailure) this.#set({ documentPositionFailure: undefined })
    if (this.#state.position?.section === section) return
    this.#set({ position: { section, step: this.#selectedSteps.get(`${this.#state.document}\0${section}`) ?? 0, trail: [], view: 'document' } })
  }

  /** A read-only inline runtime chooses a source step without navigating or editing the document. */
  observeDocumentStep(sectionId: string, stepId: string): void {
    this.#documentStep(sectionId, stepId, false)
  }

  /** An author freezes this target even when its step has not changed. */
  pauseDocumentStep(sectionId: string, stepId: string): void {
    this.#interruptProductionNavigation()
    this.#documentStep(sectionId, stepId, true)
  }

  /** A canonical step remains selectable while its next runtime snapshot is still compiling. */
  selectDocumentStep(sectionId: string, stepId: string): Promise<ProductionPlaybackState | undefined> | void {
    this.#interruptProductionNavigation()
    const source = this.#state.authoring, section = source?.content?.sections[sectionId]
    const step = section?.stepOrder.indexOf(stepId) ?? -1
    if (!section || step < 0) return
    this.#pendingGo = undefined
    if (this.#state.webView === 'document') { this.pauseDocumentStep(sectionId, stepId); return }
    const plan = this.#state.productionPlan, range = plan?.pages.find(page => page.sectionId === sectionId)?.steps.find(step => step.stepId === stepId)
    if (plan?.canPreview && this.#productionReady() && range?.startMs !== undefined) {
      this.stopAuditions()
      if (this.#productionPlayback.selecting(sectionId, stepId)) return
      this.#selectedSteps.set(`${this.#state.document}\0${sectionId}`, step)
      this.#set({ position: { section: sectionId, step, trail: [], view: 'present' } })
      return this.controlProduction({ binding: plan.binding, action: 'step', sectionId, stepId }).catch(() => undefined)
    }
    const snapshot = this.#state.presentationSnapshot
    const compiled = this.#state.ir?.doc.sections.find(page => page.id === sectionId)?.stepIds?.indexOf(stepId) ?? -1
    if (snapshot && snapshot.version === source?.version && snapshot.fingerprint === source.fingerprint && compiled >= 0) this.goToStep(sectionId, compiled)
    else this.#set({ position: { section: sectionId, step, trail: [], view: this.#state.webView } })
  }

  #documentStep(sectionId: string, stepId: string, pause: boolean): void {
    const content = this.#state.authoring?.content, section = content?.sections[sectionId]
    if (this.#state.webView !== 'document' || !content?.sectionOrder.includes(sectionId) || !section) return
    const step = section.stepOrder.indexOf(stepId)
    if (step < 0 || content.steps[stepId]?.sectionId !== sectionId) return
    if (this.#state.documentPositionFailure) this.#set({ documentPositionFailure: undefined })
    this.#selectedSteps.set(`${this.#state.document}\0${sectionId}`, step)
    const same = this.#state.position?.section === sectionId && this.#state.position.step === step
    if (same && !pause) return
    this.#set({ position: { section: sectionId, step, trail: section.stepOrder.slice(1, step + 1).map(id => `step:${id}`), view: 'document' }, documentPositionIntent: same && pause ? 'pause' : 'seek' })
  }

  /** Complete-IR position; trail maps the same step into a filtered preview without reusing its ordinal. */
  goToStep(section: string, step: number): void {
    this.#interruptProductionNavigation()
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

  undo(): Promise<boolean> { const result = this.editing.nativeHistory('undo'); return result === undefined ? this.#changeHistory('undo') : Promise.resolve(result) }
  redo(): Promise<boolean> { const result = this.editing.nativeHistory('redo'); return result === undefined ? this.#changeHistory('redo') : Promise.resolve(result) }

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

  readHistoryPage(offset: number): Promise<void> { return this.#history.page(offset) }

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
    const document = this.#state.document, scope = this.#documentScope, identity = this.#state.authoring?.identity
    if (document === undefined || !identity || this.#state.jobPreparing) return Promise.resolve()
    const controller = this.#jobPreparation = new AbortController()
    const current = () => document === this.#state.document && scope === this.#documentScope && identity === this.#state.authoring?.identity && !controller.signal.aborted
    this.#set({ jobPreparing: { target, canCancel: true }, jobsFailure: undefined })
    return this.#timed('job.start', { 'presmium.job.target': target }, async () => {
      const stop = this.observeJobs()
      try {
        if (this.#state.hasDocumentTimingDrafts || this.#state.documentTimingDraftStorageFailure) throw new Error('job-timing-draft')
        if (this.#state.captionTimingDraftSteps?.length || this.#state.captionTimingDraftStorageFailure) throw new Error('job-caption-draft')
        await this.flushPendingEdits(controller.signal)
        if (!current()) return
        const source = this.#state.authoring
        if (!source?.version || !source.fingerprint || source.dirty || source.saving || source.composing || source.restored || source.error) throw new Error('job-save-required')
        if (this.#state.hasDocumentTimingDrafts || this.#state.documentTimingDraftStorageFailure) throw new Error('job-timing-draft')
        if (this.#state.captionTimingDraftSteps?.length || this.#state.captionTimingDraftStorageFailure) throw new Error('job-caption-draft')
        this.#set({ jobPreparing: { target, canCancel: false } })
        await this.#jobs.start(document, target, { version: source.version, fingerprint: source.fingerprint })
      } catch (error) {
        if (current()) this.#set({ jobsFailure: errorMessage(error) })
      } finally {
        stop()
        if (this.#jobPreparation === controller) {
          this.#jobPreparation = undefined
          if (current()) this.#set({ jobPreparing: undefined })
        }
      }
    })
  }

  /** Cancels the pending export intent; a document save already sent retains its own acknowledgement. */
  cancelJobPreparation(): void {
    if (!this.#state.jobPreparing?.canCancel) return
    this.#jobPreparation?.abort()
    this.#jobPreparation = undefined
    this.#set({ jobPreparing: undefined })
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
    this.#set({ previewConnection: this.#state.previewConnection + 1 })
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
      this.#productionPlayback.detach(sink)
      this.#set({ previewConnection: this.#state.previewConnection + 1 })
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
    this.#productionPlayback.report(document, report, origin)
    switch (report.type) {
      case 'ready':
      case 'updated':
        if (report.revision !== this.#state.previewIrRevision) this.#playback.stopPreviewOutputs()
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
        const snapshot = this.#state.presentationSnapshot, source = this.#state.authoring
        if (snapshot && source && (source.dirty || source.loading || source.version !== snapshot.version || source.fingerprint !== snapshot.fingerprint)) break
        // An initial loader can report its old cursor while a newer stable selection is preparing.
        // Explicit native exits still reach the outer document workspace.
        if (report.view !== 'document' && this.#productionPlayback.selecting()) break
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
        else if (report.command === 'redo') void this.redo()
        else if (report.command === 'save') void this.flushPendingEdits().catch(() => {})
        else for (const listener of this.#playbackKeys) listener(report.command)
        break
      default:
        break
    }
  }

  #broadcast(command: PreviewCommand): void {
    for (const sink of this.#previewSinks) sink.send(command)
  }

  #stopSubscriptions(): void {
    this.#componentPropertyDrafts.stopAgentRead()
    this.editing.reset()
    this.#presentationPreparation++
    this.#presentationController?.abort(new Error('client-document-changed'))
    this.#voiceover.stop()
    this.#productionPlayback.reset()
    this.#set({ isPreparingPresentation: false, presentationFailure: undefined, presentationSnapshot: undefined, productionPlan: undefined, productionFailure: undefined })
    this.production.reset()
    this.#documentSession.close()
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
    this.#commentDrafts.close()
    this.#componentPropertyDrafts.close()
    this.production.dispose()
    disposeTranscriptionSessions(this.client)
    disposeDocumentRecordings(this)
    this.#clientControls.clear(); this.#navigationGuards.clear(); this.#clientControlListeners.clear()
  }
}
