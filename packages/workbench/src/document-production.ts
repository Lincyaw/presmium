import { applyDocumentCaptionTiming, changeDocumentCaptionScale, DOCUMENT_AUDIO_MAX_BYTES, randomUUID, replaceStepNarrations, sameProductionBinding, validateDocument } from '@lincyaw/kernel'
import type { DocumentAudioImportAnswer, DocumentAudioInspectionAnswer, DocumentCaptionTimingAction, DocumentChangeAnswer, DocumentRecordingAdoption, DocumentTranscriptionRequest, MediaClip, Narration, ProductionBinding, TeachingDocument, TimeRange, TranscriptionAdoptionAnswer, TranscriptionAdoptionApply, TranscriptionAdoptionDraft, TranscriptionAdoptionPlan, TranscriptionTask, VerifiedDocumentRecordingAdoption, VoiceSource } from '@lincyaw/kernel'
import { isAgentChanging } from './workbench-state.ts'
import type { WorkbenchStore } from './workbench-state.ts'
import type { DocumentSession, DocumentSessionState } from './document-session.ts'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import { sha256 } from './sha256.ts'
import { reconcileRecordingAdoption } from './recording-adoption.ts'
import { changeDocumentVoice } from './document-voices.ts'
import type { DocumentVoiceOptions, DocumentVoiceScope } from './document-voices.ts'
import { componentSource, sameComponentSource } from './component-properties.ts'
import { reconcileCaptionTiming } from './caption-timing.ts'
import { changeStepTiming } from './step-production.ts'
import type { StepDurationDraft, StepDurationKey, StepTimingPatch } from './step-production.ts'
import { DocumentTimingDrafts } from './document-timing-drafts.ts'
import { CaptionTimingDrafts } from './caption-timing-drafts.ts'
import type { CaptionTimingDraft } from './caption-timing-drafts.ts'

interface ProductionOptions {
  store: WorkbenchStore
  session: DocumentSession
  client: WorkspaceClient
  scope(): number
  document(identity?: string): TeachingDocument | undefined
  flush(signal?: AbortSignal): Promise<void>
  pause(): Promise<void>
  stopAuditions(): void
  stopPreviewOutputs(): void
  sourceCurrent(binding: ProductionBinding): boolean
}
export interface RecordingRangeDraft { version: string, voice: Extract<VoiceSource, { type: 'recording' }>, range?: TimeRange, startText?: string, endText?: string }

/** Source-bound media transactions, timing drafts and narration edits share the document actor. */
export class DocumentProduction {
  readonly #audioImports = new WeakMap<File, { identity: string, version: string, id: string }>()
  readonly #audioFingerprints = new WeakMap<File, Promise<string>>()
  readonly #documentTimingDrafts = new DocumentTimingDrafts()
  readonly #captionTimingDrafts = new CaptionTimingDrafts()
  readonly #recordingRangeDrafts = new Map<string, Map<string, RecordingRangeDraft>>()
  readonly #removedCueTimings = new Map<string, { pauseMs: number }>()
  readonly #removedNarrations = new Map<string, { narration: Narration, override?: { narrationStart: 'with-animation' | 'after-animation' } }>()
  #cueTimingScope?: string
  readonly #options: ProductionOptions
  constructor(options: ProductionOptions) { this.#options = options }
  draftState(authoring: DocumentSessionState) {
    const scope = JSON.stringify([authoring.identity, authoring.reset])
    if (this.#cueTimingScope !== scope) { this.#removedCueTimings.clear(); this.#removedNarrations.clear(); this.#cueTimingScope = scope }
    return {
      hasDocumentTimingDrafts: Boolean(authoring.identity && authoring.content && this.#documentTimingDrafts.has(authoring.identity, authoring.content)),
      documentTimingDraftStorageFailure: this.#documentTimingDrafts.failed,
      captionTimingDraftSteps: authoring.identity && authoring.member?.id && authoring.content ? this.#captionTimingDrafts.steps({ identity: authoring.identity, memberId: authoring.member.id }, authoring.content) : [],
      captionTimingDraftStorageFailure: Boolean(authoring.identity && authoring.member?.id && this.#captionTimingDrafts.failed({ identity: authoring.identity, memberId: authoring.member.id })),
    }
  }
  reset(): void { this.#removedCueTimings.clear(); this.#removedNarrations.clear(); this.#cueTimingScope = undefined }
  dispose(): void { this.reset(); this.#captionTimingDrafts.close(); this.#recordingRangeDrafts.clear() }
  /** Native pending range input survives mode and document changes within this workbench. */
  recordingRangeDrafts(identity: string): Map<string, RecordingRangeDraft> {
    let values = this.#recordingRangeDrafts.get(identity)
    if (!values) { values = new Map(); this.#recordingRangeDrafts.set(identity, values) }
    return values
  }

  source(expected: { identity: string, version: string }): DocumentSessionState {
    const source = this.#options.store.state.authoring
    if (!source || !this.#options.document(expected.identity) || source.version !== expected.version || !source.fingerprint
      || source.dirty || source.saving || source.composing || source.restored || source.error || isAgentChanging(this.#options.store.state)) throw new Error('production-source-changed')
    return source
  }
  /** Inspects the saved declaration, including a local asset not yet attached to a step. */
  async inspectAudio(assetId: string, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<DocumentAudioInspectionAnswer> {
    const source = this.source(expected), scope = this.#options.scope()
    const answer = await this.#options.client.readDocumentAudio(source.directory, assetId, expected.version, signal)
    signal?.throwIfAborted()
    if (scope !== this.#options.scope() || answer.document !== source.directory || answer.version !== expected.version || answer.fingerprint !== source.fingerprint || answer.inspection.assetId !== assetId) throw new Error('production-source-changed')
    this.source(expected)
    return answer
  }
  /** Recognition keeps its captured source even if subsequent author input moves to a newer version. */
  async startTranscription(request: Omit<DocumentTranscriptionRequest, 'source'>, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<TranscriptionTask> {
    const source = this.source(expected)
    if (!source.content || !source.fingerprint) throw new Error('production-source-changed')
    const sent: DocumentTranscriptionRequest = { ...structuredClone(request), source: { documentId: source.content.id, version: expected.version, fingerprint: source.fingerprint } }
    const answer = await this.#options.client.startTranscription(source.directory, sent, signal)
    signal?.throwIfAborted()
    if (answer.document !== source.directory || answer.intent !== sent.intent || answer.source.documentId !== sent.source.documentId
      || answer.source.version !== sent.source.version || answer.source.fingerprint !== sent.source.fingerprint || answer.audio.assetId !== sent.assetId || answer.audio.sha256 !== sent.audioSha256) throw new Error('transcription-response-changed')
    return answer
  }
  async planTranscription(draft: TranscriptionAdoptionDraft, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<TranscriptionAdoptionPlan> {
    const source = this.source(expected), sent = structuredClone(draft)
    if (sent.source.documentId !== source.content?.id || sent.source.version !== expected.version || sent.source.fingerprint !== source.fingerprint) throw new Error('production-source-changed')
    const answer = await this.#options.client.planTranscriptionAdoption(source.directory, sent, signal)
    signal?.throwIfAborted()
    this.source(expected)
    if (answer.document !== source.directory || answer.changeId !== sent.id || answer.source.documentId !== sent.source.documentId
      || answer.source.version !== sent.source.version || answer.source.fingerprint !== sent.source.fingerprint || answer.candidate.id !== sent.candidate.id
      || answer.candidate.revision !== sent.candidate.revision || answer.draftRevision !== sent.draftRevision) throw new Error('transcription-response-changed')
    return answer
  }
  async adoptTranscription(request: TranscriptionAdoptionApply, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<TranscriptionAdoptionAnswer> {
    const source = this.source(expected), sent = structuredClone(request)
    if (sent.source.documentId !== source.content?.id || sent.source.version !== expected.version || sent.source.fingerprint !== source.fingerprint) throw new Error('production-source-changed')
    const answer = await this.#writeDocumentMedia(expected, directory => this.#options.client.applyTranscriptionAdoption(directory, sent, signal), signal)
    if (answer.adoption.planId !== sent.planId || answer.adoption.candidate.id !== sent.candidate.id || answer.adoption.candidate.revision !== sent.candidate.revision
      || answer.adoption.draftRevision !== sent.draftRevision) throw new Error('transcription-response-changed')
    return answer
  }
  async #writeDocumentMedia<T extends DocumentChangeAnswer>(expected: { identity: string, version: string }, write: (directory: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const scope = this.#options.scope(), source = this.source(expected)
    this.#options.stopAuditions()
    await this.#options.pause()
    await this.#options.flush(signal)
    signal?.throwIfAborted()
    if (scope !== this.#options.scope()) throw new Error('production-source-changed')
    this.source(expected)
    let answer: T
    try { answer = await write(source.directory) }
    finally { await this.#options.session.refresh(source.directory) }
    signal?.throwIfAborted()
    if (scope !== this.#options.scope() || answer.document !== source.directory || answer.content.id !== source.content?.id) throw new Error('production-source-changed')
    this.source({ identity: expected.identity, version: answer.version })
    return answer
  }
  /** Import commits the original file and its declaration together, without creating a clip or narration. */
  async importAudio(file: File, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<DocumentAudioImportAnswer> {
    let request: { identity: string, version: string, id: string } | undefined
    const answer = await this.#writeDocumentMedia(expected, async directory => {
      const existing = this.#audioImports.get(file), first = !existing || existing.identity !== expected.identity
      request = first ? { identity: expected.identity, version: expected.version, id: randomUUID() } : existing!
      this.#audioImports.set(file, request)
      try { return await this.#options.client.importDocumentAudio(directory, file, { id: request.id, baseDocumentVersion: request.version }, signal) }
      catch (error) {
        if (first && error instanceof WorkspaceServerError && error.status >= 400 && error.status < 500 && this.#audioImports.get(file) === request) this.#audioImports.delete(file)
        throw error
      }
    }, signal)
    if (answer.changeId !== request?.id || answer.inspection.assetId !== answer.assetId || !answer.content.assets[answer.assetId]) throw new Error('production-source-changed')
    if (this.#audioImports.get(file) === request) this.#audioImports.delete(file)
    return answer
  }
  /** Reconcile an ambiguous save against real asset bytes before admitting a new source-bound import. */
  async ensureAudio(file: File, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<DocumentAudioInspectionAnswer> {
    const source = this.source(expected)
    if (!file.size || file.size > DOCUMENT_AUDIO_MAX_BYTES) throw new Error('production.asset-size')
    let pending = this.#audioFingerprints.get(file)
    if (!pending) {
      pending = file.arrayBuffer().then(sha256)
      this.#audioFingerprints.set(file, pending)
    }
    const hash = await pending
    signal?.throwIfAborted(); this.source(expected)
    for (const asset of Object.values(source.content?.assets ?? {})) {
      if (asset.kind !== 'audio' || asset.fingerprint !== `sha256:${hash}`) continue
      try {
        const answer = await this.inspectAudio(asset.id, expected, signal)
        if (answer.inspection.sha256 === hash) return answer
      } catch (error) {
        if (!(error instanceof WorkspaceServerError) || ![404, 413, 422].includes(error.status)) throw error
      }
    }
    signal?.throwIfAborted(); this.source(expected)
    const previous = this.#audioImports.get(file)
    if (previous?.identity === expected.identity && previous.version !== expected.version) this.#audioImports.delete(file)
    let imported: DocumentAudioImportAnswer
    try { imported = await this.importAudio(file, expected, signal) }
    catch (error) {
      if (!previous || this.#audioImports.get(file) !== previous || !(error instanceof WorkspaceServerError)
        || error.status !== 409 || error.message !== 'document-version-changed') throw error
      signal?.throwIfAborted(); this.source(expected)
      this.#audioImports.delete(file)
      imported = await this.importAudio(file, expected, signal)
    }
    return { document: imported.document, version: imported.version, fingerprint: imported.fingerprint, inspection: imported.inspection }
  }
  /** The source actor owns this external transaction; capture is independent from preview output. */
  async adoptRecording(request: DocumentRecordingAdoption, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<VerifiedDocumentRecordingAdoption> {
    const scope = this.#options.scope(), source = this.source(expected), sent = structuredClone(request)
    if (sent.source.documentId !== source.content?.id || sent.source.version !== source.version || sent.source.fingerprint !== source.fingerprint
      || !source.content.steps[sent.stepId] || !source.content.assets[sent.assetId]) throw new Error('production-source-changed')
    this.#options.stopPreviewOutputs()
    await this.#options.pause()
    await this.#options.flush(signal)
    signal?.throwIfAborted()
    if (scope !== this.#options.scope()) throw new Error('production-source-changed')
    this.source(expected)
    const answer = await this.#options.session.commitExternal(expected, async (_before, ownedSignal) => {
      const saved = await this.#options.client.adoptRecording(source.directory, sent, ownedSignal)
      if (saved.changeId !== sent.id || saved.verification.stepId !== sent.stepId || saved.verification.assetId !== sent.assetId || saved.verification.sha256 !== sent.sha256) throw new Error('document-confirmation')
      return saved
    }, (before, remote, current) => reconcileRecordingAdoption(sent, before, remote, current), signal)
    signal?.throwIfAborted()
    if (scope !== this.#options.scope() || this.#options.store.state.authoring?.identity !== expected.identity) throw new Error('production-source-changed')
    return answer
  }
  async applyMediaClip(clip: MediaClip, expected: { identity: string, version: string, binding: ProductionBinding }, signal?: AbortSignal): Promise<DocumentChangeAnswer> {
    this.source(expected)
    if (!this.#options.store.state.productionPlan || !sameProductionBinding(this.#options.store.state.productionPlan.binding, expected.binding) || !this.#options.sourceCurrent(expected.binding)) throw new Error('production-source-changed')
    const id = randomUUID(), value = structuredClone(clip)
    const answer = await this.#writeDocumentMedia(expected, directory => this.#options.client.changeDocumentMediaClip(directory, { id, baseDocumentVersion: expected.version, binding: expected.binding, clip: value }, signal), signal)
    if (answer.changeId !== id) throw new Error('production-source-changed')
    return answer
  }
  async removeMediaClip(clipId: string, expected: { identity: string, version: string }, signal?: AbortSignal): Promise<DocumentChangeAnswer> {
    const id = randomUUID()
    const answer = await this.#writeDocumentMedia(expected, directory => this.#options.client.changeDocumentMediaClip(directory, { id, baseDocumentVersion: expected.version, removeClipId: clipId }, signal), signal)
    if (answer.changeId !== id) throw new Error('production-source-changed')
    return answer
  }
  /** Applies a reviewed voice scope to the current source actor, without replacing body or narration. */
  async applyVoice(scope: DocumentVoiceScope, value: VoiceSource | null, options: DocumentVoiceOptions, expected: { identity: string, version: string, fingerprint: string }): Promise<boolean> {
    const source = this.#options.store.state.authoring, document = this.#options.document(expected.identity), context = this.#options.scope()
    if (!source || !document || source.version !== expected.version || source.fingerprint !== expected.fingerprint
      || source.dirty || source.saving || source.composing || source.restored || source.error || isAgentChanging(this.#options.store.state)) throw new Error('voice-context-changed')
    const next = changeDocumentVoice(document, scope, value, options)
    if (next === document) return true
    this.#options.stopAuditions()
    this.#options.session.record(next)
    await this.#options.flush()
    if (context !== this.#options.scope() || this.#options.store.state.authoring?.identity !== expected.identity) return false
    const saved = this.#options.store.state.authoring
    if (!saved || saved.dirty || saved.saving || saved.composing || saved.restored || saved.error) throw new Error('voice-save-unconfirmed')
    return true
  }

  /** Manual caption times reuse the canonical action plan, media preflight and original source actor. */
  async applyCaptionTiming(action: DocumentCaptionTimingAction, id: string, expected: { identity: string, version: string, fingerprint: string }, signal?: AbortSignal): Promise<DocumentChangeAnswer> {
    const source = this.source(expected), scope = this.#options.scope()
    if (!source.content || source.fingerprint !== expected.fingerprint) throw new Error('caption-source-changed')
    const request = { id, source: componentSource({ content: source.content, version: source.version!, fingerprint: source.fingerprint! }), action }
    const plan = await this.#options.client.planDocumentAction(source.directory, request, signal)
    signal?.throwIfAborted()
    if (scope !== this.#options.scope() || this.#options.store.state.authoring?.identity !== expected.identity || plan.effect.kind !== 'caption'
      || plan.changeId !== id || JSON.stringify(plan.action) !== JSON.stringify(action) || !sameComponentSource(plan.source, request.source)) throw new Error('caption-source-changed')
    this.#options.stopPreviewOutputs()
    await this.#options.pause()
    try {
      return await this.#options.session.commitExternal(expected, async (_before, ownedSignal) => {
        const receipt = await this.#options.client.applyDocumentAction(source.directory, { planId: plan.planId, digest: plan.digest, source: plan.source }, ownedSignal)
        const actual = await this.#options.client.readDocument(source.directory)
        if (receipt.planId !== plan.planId || receipt.digest !== plan.digest || receipt.changeId !== id || !receipt.verification.saved || !receipt.verification.actionStateVerified
          || !sameComponentSource(receipt.verification.source, componentSource(actual))) throw new Error('document-confirmation')
        return { ...actual, changeId: id, files: receipt.files }
      }, (before, answer, current) => reconcileCaptionTiming(action, before, answer, current), signal)
    } catch (error) {
      const current = this.#options.store.state.authoring, file = plan.files.find(file => file.path === (source.directory ? `${source.directory}/lecture.json` : 'lecture.json'))
      // Lost ACK was independently read by commitExternal; only the exact predicted saved version can settle it.
      if (scope === this.#options.scope() && current?.identity === expected.identity && current.content && current.version === file?.version && current.fingerprint && !current.error) {
        try {
          if (!applyDocumentCaptionTiming(current.content, action).effect.changed) return { document: source.directory, content: plan.content, version: current.version!, fingerprint: current.fingerprint, changeId: id, issues: plan.issues, files: plan.files.map(({ path, version }) => ({ path, version })) }
        } catch { /* A newer target stays pending with the actual request error. */ }
      }
      throw error
    }
  }
  /** Uses the current actor revision so timing edits cannot replace later body or narration input. */
  setStepTiming(stepId: string, patch: StepTimingPatch, identity?: string): void {
    const document = this.#options.document(identity)
    if (!document || isAgentChanging(this.#options.store.state)) return
    const next = changeStepTiming(document, stepId, patch)
    if (next === document) return
    this.#options.stopAuditions()
    this.#options.session.record(next)
  }
  /** The whole document's caption size (`production.captions.scale`), recorded like a step's timing. */
  setCaptionScale(scale: number, identity?: string): void {
    const document = this.#options.document(identity)
    if (!document || isAgentChanging(this.#options.store.state)) return
    const next = changeDocumentCaptionScale(document, scale)
    if (next === document) return
    this.#options.session.record(next)
  }
  timingDraft(stepId: string, key: StepDurationKey, identity: string, reset: number): StepDurationDraft | undefined {
    const document = this.#options.document(identity)
    return document && this.#options.store.state.authoring?.reset === reset ? this.#documentTimingDrafts.get(identity, document, stepId, key) : undefined
  }
  /** Retains unaccepted numeric input by stable target; it is not authoring content or a second timing source. */
  setTimingDraft(stepId: string, key: StepDurationKey, draft: StepDurationDraft | undefined, identity: string, reset: number): void {
    const source = this.#options.store.state.authoring, document = this.#options.document(identity)
    if (!document?.steps[stepId] || source?.reset !== reset || isAgentChanging(this.#options.store.state)) return
    if (!this.#documentTimingDrafts.set(identity, document, stepId, key, draft)) return
    this.#options.store.set({ authoring: { ...source }, hasDocumentTimingDrafts: this.#documentTimingDrafts.has(identity, document), documentTimingDraftStorageFailure: this.#documentTimingDrafts.failed })
  }
  captionTimingDraft(stepId: string, identity: string): CaptionTimingDraft | undefined {
    const source = this.#options.store.state.authoring
    return source?.identity === identity && source.member?.id ? this.#captionTimingDrafts.get({ identity, memberId: source.member.id }, stepId) : undefined
  }
  setCaptionTimingDraft(stepId: string, draft: CaptionTimingDraft | undefined, identity: string): void {
    const source = this.#options.store.state.authoring, document = this.#options.document(identity)
    if (!document?.steps[stepId] || source?.identity !== identity || !source.member?.id) return
    const scope = { identity, memberId: source.member.id }
    this.#captionTimingDrafts.set(scope, stepId, draft)
    this.#options.store.set({ captionTimingDraftSteps: this.#captionTimingDrafts.steps(scope, document), captionTimingDraftStorageFailure: this.#captionTimingDrafts.failed(scope) })
  }
  copyNarrationCueTiming(from: string, to: string, identity: string): void {
    const document = this.#options.document(identity)
    if (!document || isAgentChanging(this.#options.store.state)) return
    const timing = document.production.cueTimings?.[from] ?? this.#removedCueTimings.get(from)
    if (timing) this.#removedCueTimings.set(to, { ...timing })
  }
  /** Native block identity and order own the current step's complete script. */
  setNarrations(stepId: string, narrations: Narration[], identity?: string): void {
    const document = this.#options.document(identity)
    if (!document || isAgentChanging(this.#options.store.state) || !Object.hasOwn(document.steps, stepId)) return
    const step = document.steps[stepId]!
    if (!document.sections[step.sectionId]?.stepOrder.includes(stepId)) return
    const values = narrations.map(narration => {
      const previous = document.narrations[narration.id] ?? this.#removedNarrations.get(narration.id)?.narration
      return { ...previous, ...narration }
    })
    if (JSON.stringify(step.narrationIds.map(id => document.narrations[id])) === JSON.stringify(values)) return
    const next = replaceStepNarrations(document, stepId, values)
    for (const narration of values) {
      const override = this.#removedNarrations.get(narration.id)?.override
      if (override && !document.narrations[narration.id]) next.production.narrationOverrides = { ...next.production.narrationOverrides, [narration.id]: { ...override } }
    }
    const cueIds = new Set(values.flatMap(narration => narration.content.flatMap(node => node.type === 'cue' ? [node.id] : [])))
    for (const cue of cueIds) {
      const timing = this.#removedCueTimings.get(cue)
      if (timing && !Object.hasOwn(next.production.cueTimings ?? {}, cue)) next.production.cueTimings = { ...next.production.cueTimings, [cue]: { ...timing } }
    }
    const references = (values: Narration[]) => JSON.stringify(values.map(narration => [narration.id, narration.provenance, narration.content.filter(node => node.type === 'cue')]))
    if (references(step.narrationIds.map(id => document.narrations[id]!)) !== references(values)
      && validateDocument(next).issues.some(issue => issue.severity === 'error')) throw new Error('document-narration-content')
    for (const id of step.narrationIds) if (!next.steps[stepId]!.narrationIds.includes(id)) {
      this.#removedNarrations.delete(id)
      this.#removedNarrations.set(id, { narration: document.narrations[id]!, override: document.production.narrationOverrides?.[id] })
    }
    for (const [id, timing] of Object.entries(document.production.cueTimings ?? {})) if (!Object.hasOwn(next.production.cueTimings ?? {}, id)) {
      this.#removedCueTimings.delete(id)
      this.#removedCueTimings.set(id, { ...timing })
    }
    while (this.#removedNarrations.size > 512) this.#removedNarrations.delete(this.#removedNarrations.keys().next().value!)
    while (this.#removedCueTimings.size > 512) this.#removedCueTimings.delete(this.#removedCueTimings.keys().next().value!)
    this.#options.stopAuditions()
    this.#options.session.record(next)
  }
}
