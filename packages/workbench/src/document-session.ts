import { validateDocument } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentChangeAnswer, DocumentImageImportAnswer, DocumentIssue, TeachingDocument } from '@lincyaw/kernel'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import { DocumentDrafts } from './document-drafts.ts'
import type { DocumentDraftChoice, DocumentDraftCommit, DocumentDraftReference, StoredDocumentDraft } from './document-drafts.ts'

export interface DocumentSessionState {
  directory: string
  identity?: string
  content?: TeachingDocument
  version?: string
  fingerprint?: string
  projectRevision?: number
  loading: boolean
  dirty: boolean
  saving: boolean
  restored: boolean
  composing: boolean
  storageFailure: boolean
  backupPending?: boolean
  recoveryReadFailure?: boolean
  reset: number
  error?: string
  issues: DocumentIssue[]
  recovering?: boolean
  recoveryDrafts?: DocumentDraftChoice[]
  recoveryChanged?: boolean
}
interface Slot {
  state: DocumentSessionState
  read: number
  compositions: Set<string>
  input: number
  baseHash: string
  storage: string
  drafts: DocumentDrafts
  backup?: DocumentDraftCommit
  draft?: StoredDocumentDraft
  draftOrigins?: DocumentDraftReference[]
  draftRead?: number
  draftFailure?: boolean
  legacyFailure?: 'read' | 'write'
  persistFailure?: boolean
  recoveryOperation?: number
  flight?: { id: string, input: number, content: TeachingDocument, baseVersion: string, hash?: string }
  assetFlight?: Promise<DocumentChangeAnswer>
  timer?: ReturnType<typeof setTimeout>
  refreshed?: boolean
  pendingHash?: string
  projectObservation?: string
}

const serialize = (value: unknown) => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry)
/** Media clips and new unused assets do not replace any mounted editor's content or identity. */
function keepsEditorContent(before: TeachingDocument, after: TeachingDocument): boolean {
  const editing = ({ assets: _assets, production, ...document }: TeachingDocument) => {
    const { mediaClips: _clips, ...settings } = production
    return { ...document, production: settings }
  }
  return serialize(editing(before)) === serialize(editing(after))
    && Object.entries(before.assets).every(([id, asset]) => Object.hasOwn(after.assets, id) && serialize(asset) === serialize(after.assets[id]))
}
async function digest(value: TeachingDocument): Promise<string> {
  const text = serialize(value)
  if (!globalThis.crypto?.subtle) return `json:${text}`
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
}

/** One source actor per document. Runtime compilation and iframe lifecycle never own its input. */
export class DocumentSession {
  readonly #client: WorkspaceClient
  readonly #changed: (state: DocumentSessionState) => void
  readonly #slots = new Map<string, Slot>()
  readonly #imageImports = new WeakMap<File, { identity: string, version: string, id: string }>()
  #active?: string
  #opening = 0
  #unsubscribe?: () => void
  #disposed = false
  #leaveTarget?: Window
  readonly #storageChanged = (event: StorageEvent) => {
    if (this.#disposed) return
    for (const slot of this.#slots.values()) if (slot.state.identity && slot.drafts.matches(slot.state.identity, event.key)) void this.#readDrafts(slot)
  }
  readonly #draftFocus = () => { const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active); if (slot && !this.#disposed) void this.#readDrafts(slot) }
  readonly #beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
  constructor(client: WorkspaceClient, changed: (state: DocumentSessionState) => void) {
    this.#client = client; this.#changed = changed
    if (typeof window !== 'undefined') { window.addEventListener('storage', this.#storageChanged); window.addEventListener('focus', this.#draftFocus) }
  }

  #syncLeaveProtection(): void {
    const pending = !this.#disposed && [...this.#slots.values()].some(slot => slot.state.dirty || slot.state.composing || slot.flight || slot.assetFlight)
    const target = pending && typeof window !== 'undefined' ? window : undefined
    if (target === this.#leaveTarget) return
    this.#leaveTarget?.removeEventListener('beforeunload', this.#beforeUnload)
    target?.addEventListener('beforeunload', this.#beforeUnload)
    this.#leaveTarget = target
  }

  async open(directory: string): Promise<void> {
    if (this.#active !== directory) this.interrupt()
    const opening = ++this.#opening
    this.#active = directory
    this.#unsubscribe?.()
    const cached = this.#slots.get(directory)
    if (cached) { cached.read++; cached.state = { ...cached.state, loading: true } }
    this.#changed(cached ? { ...cached.state } : { directory, loading: true, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: [] })
    try {
      const [info, answer] = await Promise.all([this.#client.readWorkbenchInfo(), this.#client.readDocument(directory)])
      if (this.#active !== directory || opening !== this.#opening) return
      let slot = this.#slots.get(directory)
      if (!slot) {
        const baseHash = await digest(answer.content)
        if (this.#disposed || this.#active !== directory || opening !== this.#opening) return
        const drafts = new DocumentDrafts(() => { if (slot && !this.#disposed) void this.#readDrafts(slot) })
        slot = { input: 0, read: 0, compositions: new Set(), drafts, baseHash, storage: `presmium.document.v1:${JSON.stringify([info.root, answer.content.id])}`, state: { directory, identity: JSON.stringify([info.root, answer.content.id]), content: answer.content, version: answer.version, fingerprint: answer.fingerprint, loading: true, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: answer.issues } }
        this.#slots.set(directory, slot)
        await this.#restore(slot, answer)
      } else {
        await this.#adopt(slot, answer, () => this.#active === directory && opening === this.#opening)
        await this.#readDrafts(slot)
      }
      this.#syncLeaveProtection()
      if (this.#active !== directory || opening !== this.#opening) return
      // A fresh observation invalidates idle project references before the editor becomes ready.
      slot.projectObservation = undefined
      slot.state = { ...slot.state, loading: false, projectRevision: (slot.state.projectRevision ?? 0) + 1 }
      this.#emit(slot)
      this.#prune()
      this.#unsubscribe = this.#client.subscribeDocument(directory, event => {
        const current = this.#slots.get(directory)
        if (!current) return
        const projectChanged = current.projectObservation !== undefined && event.projectRevision !== undefined && event.projectRevision !== current.projectObservation
        current.projectObservation = event.projectRevision
        if (event.version === current.state.version) {
          if (projectChanged) { current.state = { ...current.state, projectRevision: (current.state.projectRevision ?? 0) + 1 }; this.#emit(current) }
          return
        }
        if (current.flight || current.assetFlight) { current.refreshed = true; return }
        void this.refresh(directory)
      }, () => {})
    } catch (error) {
      if (this.#active === directory && opening === this.#opening) {
        const state = { ...(cached?.state ?? { directory, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: [] }), loading: false, error: this.#error(error), issues: this.#issues(error) }
        if (cached) cached.state = state
        this.#changed(state)
      }
    }
  }

  close(): void { this.interrupt(); this.#active = undefined; this.#opening++; this.#unsubscribe?.(); this.#unsubscribe = undefined }
  #prune(): void {
    for (const [directory, slot] of this.#slots) {
      if (this.#slots.size <= 8) return
      if (directory === this.#active || slot.flight || slot.assetFlight || slot.state.dirty || slot.state.composing) continue
      clearTimeout(slot.timer)
      slot.drafts.close()
      this.#slots.delete(directory)
    }
  }
  #emit(slot: Slot): void { this.#syncLeaveProtection(); if (this.#active === slot.state.directory && this.#slots.get(slot.state.directory) === slot) this.#changed({ ...slot.state }) }
  #error(error: unknown): string { return error instanceof WorkspaceServerError ? error.answer.error ?? 'document-request-failed' : 'document-disconnected' }
  #issues(error: unknown): DocumentIssue[] { const value = error instanceof WorkspaceServerError ? (error.answer as { issues?: DocumentIssue[] }).issues : undefined; return Array.isArray(value) ? value : [] }

  async refresh(directory = this.#active): Promise<void> {
    if (directory === undefined) return
    const slot = this.#slots.get(directory)
    if (!slot) { if (directory === this.#active) await this.open(directory); return }
    if (slot.flight || slot.assetFlight) { slot.refreshed = true; return }
    const read = ++slot.read, current = () => slot.read === read && this.#slots.get(directory) === slot
    try {
      const answer = await this.#client.readDocument(directory)
      if (!current()) return
      if (slot.flight || slot.assetFlight) { slot.refreshed = true; return }
      await this.#adopt(slot, answer, current)
      if (current()) { this.#persist(slot); this.#emit(slot); void this.#readDrafts(slot) }
    } catch (error) {
      if (current()) { slot.state = { ...slot.state, error: this.#error(error), issues: this.#issues(error) }; this.#emit(slot) }
    }
  }

  async #adopt(slot: Slot, answer: DocumentAnswer, current = () => true): Promise<void> {
    if (!current()) return
    if (answer.content.id !== slot.state.content?.id) { slot.state = { ...slot.state, error: 'document-identity-changed' }; return }
    if (answer.version === slot.state.version) {
      if (answer.fingerprint !== slot.state.fingerprint) slot.state = { ...slot.state, fingerprint: answer.fingerprint, issues: answer.issues }
      return
    }
    const remoteHash = await digest(answer.content)
    if (!current()) return
    if (slot.state.dirty || slot.state.composing) {
      const input = slot.input, localHash = await digest(slot.state.content!)
      if (!current()) return
      if (remoteHash === localHash) {
        const same = slot.input === input && !slot.state.composing
        slot.baseHash = remoteHash
        slot.pendingHash = undefined
        slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, dirty: !same, error: undefined, issues: answer.issues }
      } else if (remoteHash === slot.pendingHash) {
        slot.baseHash = remoteHash; slot.pendingHash = undefined
        slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, error: undefined, issues: answer.issues }
      } else if (remoteHash === slot.baseHash) slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, issues: answer.issues }
      else slot.state = { ...slot.state, error: 'document-version-changed', issues: answer.issues }
      return
    }
    const reset = slot.state.reset + (keepsEditorContent(slot.state.content!, answer.content) ? 0 : 1)
    slot.baseHash = remoteHash
    slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, content: answer.content, reset, error: undefined, issues: answer.issues }
  }

  record(content: TeachingDocument): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || content.id !== slot.state.content?.id) return
    slot.input++
    slot.state = { ...slot.state, content: structuredClone(content), dirty: true }
    this.#persist(slot); this.#emit(slot)
    this.#schedule(slot)
  }

  #schedule(slot: Slot): void {
    clearTimeout(slot.timer)
    slot.timer = undefined
    if (slot.state.dirty && !slot.state.restored && !slot.state.error && !slot.state.composing) slot.timer = setTimeout(() => { slot.timer = undefined; void this.#save(slot) }, 600)
  }

  replace(content: TeachingDocument): void {
    this.record(content)
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (slot) { slot.state.reset++; this.#emit(slot) }
  }

  composition(composing: boolean, owner = 'body', identity?: string): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || identity !== undefined && identity !== slot.state.identity || slot.compositions.has(owner) === composing) return
    if (composing) slot.compositions.add(owner)
    else slot.compositions.delete(owner)
    slot.state = { ...slot.state, composing: slot.compositions.size > 0 }
    this.#persist(slot); this.#emit(slot)
    this.#schedule(slot)
  }
  interrupt(): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.composing) return
    slot.compositions.clear()
    slot.state = { ...slot.state, composing: false, restored: true, error: 'document-composition-interrupted' }
    this.#persist(slot); this.#emit(slot)
  }

  async #save(slot: Slot, immediate = false): Promise<void> {
    if (immediate) { clearTimeout(slot.timer); slot.timer = undefined }
    else if (slot.timer !== undefined) return
    if (slot.flight || slot.assetFlight || !slot.state.dirty || slot.state.composing || slot.state.restored || slot.state.error || !slot.state.content || !slot.state.version) return
    slot.read++
    const flight = { id: crypto.randomUUID(), input: slot.input, content: structuredClone(slot.state.content), baseVersion: slot.state.version, hash: undefined as string | undefined }
    slot.flight = flight
    slot.state = { ...slot.state, saving: true }; this.#emit(slot)
    try {
      flight.hash = await digest(flight.content)
      slot.pendingHash = flight.hash
      this.#persist(slot)
      const answer = await this.#client.changeDocument(slot.state.directory, { id: flight.id, baseDocumentVersion: flight.baseVersion, replacement: flight.content })
      if (answer.changeId !== flight.id || answer.document !== slot.state.directory || answer.content.id !== flight.content.id) throw new Error('document-confirmation')
      this.#ack(slot, flight, answer)
    } catch (error) {
      slot.state = { ...slot.state, saving: false, error: this.#error(error), issues: this.#issues(error) }
    } finally {
      if (slot.flight === flight) slot.flight = undefined
      this.#persist(slot); this.#emit(slot)
      void this.#readDrafts(slot)
      if (slot.refreshed) { slot.refreshed = false; await this.refresh(slot.state.directory) }
      if (!slot.state.error) void this.#save(slot)
    }
  }
  #ack(slot: Slot, flight: NonNullable<Slot['flight']>, answer: DocumentChangeAnswer): void {
    slot.baseHash = flight.hash!
    slot.pendingHash = undefined
    const same = slot.input === flight.input
    slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, ...(same ? { content: answer.content } : {}), dirty: !same, saving: false, error: undefined, issues: answer.issues }
  }

  /** Adopt a verified asset-only transaction without replacing later native text. */
  async #adoptImportedAssets(slot: Slot, before: TeachingDocument, input: number, answer: DocumentAnswer, owns: () => boolean): Promise<boolean> {
    const withoutAssets = ({ assets: _assets, ...content }: TeachingDocument) => serialize(content)
    if (!owns() || answer.document !== slot.state.directory || withoutAssets(before) !== withoutAssets(answer.content)
      || !Object.entries(before.assets).every(([id, asset]) => serialize(asset) === serialize(answer.content.assets[id]))) return false
    const baseHash = await digest(answer.content)
    if (!owns()) return false
    const current = slot.state.content!
    const added = Object.entries(answer.content.assets).filter(([id]) => !Object.hasOwn(before.assets, id))
    if (added.some(([id, asset]) => Object.hasOwn(current.assets, id) && serialize(current.assets[id]) !== serialize(asset))) return false
    const same = slot.input === input, content = same ? answer.content : structuredClone(current)
    if (!same) for (const [id, asset] of added) content.assets[id] = structuredClone(asset)
    slot.baseHash = baseHash
    slot.state = { ...slot.state, content, version: answer.version, fingerprint: answer.fingerprint, dirty: !same, error: undefined, issues: answer.issues }
    return true
  }

  async #adoptExternal(slot: Slot, before: TeachingDocument, input: number, answer: DocumentAnswer, owns: () => boolean, reconcile: (before: TeachingDocument, answer: DocumentAnswer, current: TeachingDocument) => TeachingDocument | undefined): Promise<boolean> {
    if (!owns() || answer.document !== slot.state.directory || answer.content.id !== before.id || !slot.state.content) return false
    if (!reconcile(before, answer, slot.state.content)) return false
    const baseHash = await digest(answer.content)
    if (!owns()) return false
    const content = reconcile(before, answer, slot.state.content!)
    if (!content || content.id !== before.id) return false
    const checked = validateDocument(content)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) return false
    slot.baseHash = baseHash
    slot.pendingHash = undefined
    slot.state = { ...slot.state, content: structuredClone(checked.document), version: answer.version, fingerprint: answer.fingerprint,
      dirty: slot.input !== input || slot.state.composing || serialize(content) !== serialize(answer.content), error: undefined, issues: answer.issues }
    return true
  }

  /** Reconcile an external source transaction without replacing later native input. */
  async commitExternal<T extends DocumentChangeAnswer>(expected: { identity: string, version: string }, submit: (before: TeachingDocument, signal?: AbortSignal) => Promise<T>, reconcile: (before: TeachingDocument, answer: DocumentAnswer, current: TeachingDocument) => TeachingDocument | undefined, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted()
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.content || this.#disposed || slot.state.identity !== expected.identity || slot.state.version !== expected.version
      || slot.state.loading || slot.state.dirty || slot.state.saving || slot.state.composing || slot.state.restored || slot.state.recovering || slot.state.error || slot.flight || slot.assetFlight) throw new Error('document-identity-changed')
    const before = structuredClone(slot.state.content), input = slot.input, read = ++slot.read, directory = slot.state.directory, baseHash = slot.baseHash, fingerprint = slot.state.fingerprint, { identity, version } = expected
    const owns = () => !this.#disposed && this.#slots.get(directory) === slot && slot.state.identity === identity && slot.read === read && slot.state.version === version
    let refreshClean = false
    const work = Promise.resolve().then(async () => {
      signal?.throwIfAborted()
      if (this.#active !== directory || !owns()) throw new Error('document-identity-changed')
      const answer = await submit(structuredClone(before), signal)
      if (!answer.changeId || !await this.#adoptExternal(slot, before, input, answer, owns, reconcile)) throw new Error('document-version-changed')
      return answer
    })
    slot.assetFlight = work
    slot.state = { ...slot.state, saving: true }; this.#emit(slot)
    try { return await work }
    catch (error) {
      if (owns()) {
        try {
          // The write may have committed before cancellation or a lost response.
          // Reconciliation reads remain independent of the submit signal.
          slot.refreshed = false
          const answer = await this.#client.readDocument(directory)
          const unchanged = answer.document === directory && answer.content.id === before.id && answer.version === version && answer.fingerprint === fingerprint && await digest(answer.content) === baseHash
          if (owns() && !unchanged && !await this.#adoptExternal(slot, before, input, answer, owns, reconcile) && owns()) {
            refreshClean = error instanceof WorkspaceServerError && error.status === 409 && slot.input === input && !slot.state.composing
            if (!refreshClean) slot.state = { ...slot.state, error: 'document-version-changed' }
          }
        } catch { if (owns()) slot.state = { ...slot.state, error: this.#error(error) } }
      }
      throw error
    } finally {
      if (slot.assetFlight === work) {
        slot.assetFlight = undefined
        slot.state = { ...slot.state, saving: false }
        this.#persist(slot); this.#emit(slot)
        if (!this.#disposed && this.#active === directory) {
          if (refreshClean && owns() && slot.input === input && !slot.state.composing) await this.refresh(directory)
          else if (slot.refreshed) { slot.refreshed = false; await this.refresh(directory) }
          if (!slot.state.error) void this.#save(slot)
        }
      }
    }
  }

  /** The file and its asset declaration share the actor's write boundary. */
  async importImage(file: File, identity: string, signal?: AbortSignal): Promise<DocumentImageImportAnswer> {
    await this.flush(signal)
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.content || !slot.state.version || slot.state.identity !== identity || slot.state.dirty || slot.state.saving || slot.state.composing || slot.state.error) throw new Error('document-identity-changed')
    const before = structuredClone(slot.state.content), input = slot.input, version = slot.state.version
    let request = this.#imageImports.get(file)
    if (!request || request.identity !== identity || request.version !== version) {
      request = { identity, version, id: crypto.randomUUID() }
      this.#imageImports.set(file, request)
    }
    const read = ++slot.read
    const owns = () => this.#slots.get(slot.state.directory) === slot && slot.read === read && slot.state.version === version
    slot.state = { ...slot.state, saving: true }; this.#emit(slot)
    const work = (async () => {
      const answer = await this.#client.importDocumentImage(slot.state.directory, file, { id: request!.id, baseDocumentVersion: request!.version }, signal)
      if (answer.changeId !== request!.id || answer.content.id !== before.id || answer.content.assets[answer.assetId]?.kind !== 'image') throw new Error('document-confirmation')
      if (!await this.#adoptImportedAssets(slot, before, input, answer, owns)) throw new Error('document-version-changed')
      return answer
    })()
    slot.assetFlight = work
    this.#syncLeaveProtection()
    try { return await work }
    catch (error) {
      // A lost reply may still have committed the file. Reconcile only a proven
      // asset addition; an unrelated external edit remains a source conflict.
      if (owns()) {
        try {
          slot.refreshed = false
          const answer = await this.#client.readDocument(slot.state.directory)
          if (!await this.#adoptImportedAssets(slot, before, input, answer, owns) && owns()) slot.state = { ...slot.state, error: 'document-version-changed' }
        } catch { /* The native upload error and the pending source draft remain. */ }
      }
      if (error instanceof WorkspaceServerError && error.status >= 400 && error.status < 500 && this.#imageImports.get(file) === request) this.#imageImports.delete(file)
      throw error
    } finally {
      if (slot.assetFlight === work) slot.assetFlight = undefined
      slot.state = { ...slot.state, saving: false }
      this.#persist(slot); this.#emit(slot)
      void this.#readDrafts(slot)
      if (slot.refreshed) { slot.refreshed = false; await this.refresh(slot.state.directory) }
      if (!slot.state.error) void this.#save(slot)
    }
  }

  async retry(): Promise<void> {
    if (this.#disposed || this.#active === undefined) return
    const slot = this.#slots.get(this.#active)
    if (!slot) { await this.open(this.#active); return }
    if (slot.flight || slot.assetFlight || slot.state.composing) return
    const previousError = slot.state.error
    slot.state = { ...slot.state, restored: false, error: undefined }
    await this.refresh(slot.state.directory)
    if (slot.state.error) { if (!previousError) this.#emit(slot); return }
    await this.#save(slot, true)
  }
  async discard(): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || slot.flight || slot.assetFlight || slot.state.composing) return
    const directory = slot.state.directory, identity = slot.state.identity, documentId = slot.state.content?.id, input = slot.input, read = ++slot.read
    const current = () => !this.#disposed && this.#slots.get(directory) === slot && slot.read === read && slot.input === input
      && slot.state.identity === identity && !slot.state.composing && !slot.flight && !slot.assetFlight
    try {
      const answer = await this.#client.readDocument(directory)
      if (!current()) return
      if (answer.document !== directory || answer.content.id !== documentId) {
        slot.state = { ...slot.state, error: 'document-identity-changed' }; this.#emit(slot)
        return
      }
      const baseHash = await digest(answer.content)
      if (!current()) return
      slot.input++; slot.baseHash = baseHash
      slot.pendingHash = undefined
      slot.compositions.clear()
      slot.state = { ...slot.state, content: answer.content, version: answer.version, fingerprint: answer.fingerprint, dirty: false, restored: false, composing: false, reset: slot.state.reset + 1, error: undefined, issues: answer.issues }
      this.#persist(slot); this.#emit(slot)
      void this.#readDrafts(slot)
    } catch (error) { if (current()) { slot.state = { ...slot.state, error: this.#error(error) }; this.#emit(slot) } }
  }
  async flush(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot) return
    if (slot.state.composing || slot.state.restored || slot.state.error) throw new Error(slot.state.error ?? 'document-draft-unconfirmed')
    const started = Date.now()
    while (slot.state.dirty || slot.flight || slot.assetFlight) {
      signal?.throwIfAborted()
      if (slot.state.error || slot.state.composing || slot.state.restored) throw new Error(slot.state.error ?? 'document-draft-unconfirmed')
      if (Date.now() - started > 30000) throw new Error('document-save-timeout')
      await this.#save(slot, true)
      if (slot.flight || slot.assetFlight) await new Promise(resolve => setTimeout(resolve, 20))
    }
  }

  #persist(slot: Slot): boolean {
    const identity = slot.state.identity
    if (!identity || !slot.state.content || !slot.state.version) return false
    let commit: DocumentDraftCommit | undefined
    if (!slot.state.dirty && !slot.state.composing && !slot.flight) {
      if (!slot.draft) {
        slot.persistFailure = false; slot.state.backupPending = false
        slot.state.storageFailure = slot.legacyFailure === 'write'
        return true
      }
      commit = slot.drafts.remove(identity, slot.draft, slot.draftOrigins ?? [])
    } else {
      commit = slot.drafts.write(identity, { content: slot.state.content, baseVersion: slot.state.version, baseHash: slot.baseHash, input: slot.input,
        pendingHash: slot.flight?.hash ?? slot.pendingHash, composing: slot.state.composing, origins: slot.draftOrigins }, slot.draft)
    }
    slot.persistFailure = !commit
    slot.state.backupPending = Boolean(commit && !commit.clearing)
    slot.backup = commit
    if (commit) {
      const previous = slot.draft?.id, input = slot.input
      if (!commit.clearing) slot.draft = commit.record
      const ticket = commit
      void ticket.done.then(result => {
        if (this.#disposed || this.#slots.get(slot.state.directory) !== slot || slot.state.identity !== identity || slot.backup !== ticket) return
        if (result === 'superseded') return
        slot.persistFailure = result === 'failed'
        slot.state = { ...slot.state, backupPending: false, storageFailure: Boolean(slot.persistFailure || slot.legacyFailure === 'write') }
        if (result === 'committed' && ticket.clearing && slot.input === input && !slot.state.dirty && !slot.state.composing) {
          slot.draft = undefined; slot.draftOrigins = undefined; slot.backup = undefined
        }
        this.#emit(slot)
        if (ticket.clearing || previous !== ticket.record.id) void this.#readDrafts(slot)
      })
    }
    slot.state.storageFailure = Boolean(slot.persistFailure || slot.legacyFailure === 'write')
    slot.state.recoveryReadFailure = Boolean(slot.draftFailure || slot.legacyFailure === 'read')
    return Boolean(commit)
  }

  async #restore(slot: Slot, answer: DocumentAnswer): Promise<void> {
    const identity = slot.state.identity!, read = slot.read, input = slot.input
    const migrated = await slot.drafts.migrate(identity, answer.content.id, slot.storage)
    if (this.#disposed || this.#slots.get(slot.state.directory) !== slot || slot.state.identity !== identity || slot.read !== read || slot.input !== input) return
    slot.legacyFailure = migrated
    await this.#readDrafts(slot)
  }

  async #readDrafts(slot: Slot): Promise<void> {
    const identity = slot.state.identity, documentId = slot.state.content?.id
    if (!identity || !documentId || this.#disposed) return
    const read = slot.draftRead = (slot.draftRead ?? 0) + 1, sourceRead = slot.read, input = slot.input, baseHash = slot.baseHash, own = slot.draft?.id
    const current = () => !this.#disposed && this.#slots.get(slot.state.directory) === slot && slot.state.identity === identity && slot.draftRead === read && slot.read === sourceRead && slot.input === input && slot.baseHash === baseHash && slot.draft?.id === own
    try {
      if (slot.legacyFailure) {
        const migrated = await slot.drafts.migrate(identity, documentId, slot.storage)
        if (!current()) return
        slot.legacyFailure = migrated
      }
      const { records, failed } = await slot.drafts.read(identity, documentId), choices: DocumentDraftChoice[] = []
      if (!current()) return
      for (const record of records) {
        if (record.id === own && record.owned || slot.draftOrigins?.some(value => value.id === record.id && value.revision === record.revision && value.token === record.token)) continue
        if (!record.composing && await digest(record.content) === baseHash) continue
        if (!current()) return
        choices.push({ id: record.id, revision: record.revision, token: record.token, updatedAt: record.updatedAt, baseVersion: record.baseVersion, source: record.source })
      }
      if (!current()) return
      slot.draftFailure = failed
      slot.state = { ...slot.state, recoveryDrafts: choices.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)),
        storageFailure: Boolean(slot.persistFailure || slot.legacyFailure === 'write'), recoveryReadFailure: Boolean(failed || slot.legacyFailure === 'read') }
      this.#emit(slot)
    } catch {
      if (current()) { slot.draftFailure = true; slot.state = { ...slot.state, recoveryReadFailure: true }; this.#emit(slot) }
    }
  }

  /** Selecting a candidate never writes the source or replaces this tab's only snapshot. */
  async recoverDraft(value: DocumentDraftReference): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.identity || !slot.state.content || slot.state.loading || slot.flight || slot.assetFlight || slot.state.composing || this.#disposed) return
    const identity = slot.state.identity, documentId = slot.state.content.id, input = slot.input, read = ++slot.read
    const operation = slot.recoveryOperation = (slot.recoveryOperation ?? 0) + 1
    const pendingSave = slot.timer !== undefined
    clearTimeout(slot.timer); slot.timer = undefined
    let adopted = false
    let protectedRecord: { id?: string, revision?: number } | undefined
    const current = () => !this.#disposed && this.#active === slot.state.directory && this.#slots.get(slot.state.directory) === slot && slot.state.identity === identity && slot.read === read && slot.input === input && slot.recoveryOperation === operation
      && !slot.state.composing && !slot.flight && !slot.assetFlight && (!protectedRecord || slot.draft?.id === protectedRecord.id && slot.draft?.revision === protectedRecord.revision)
    slot.state = { ...slot.state, recovering: true, recoveryChanged: false }; this.#emit(slot)
    try {
      if (!this.#persist(slot)) { this.#emit(slot); return }
      const backup = slot.backup
      if (backup && await backup.done !== 'committed') return
      if (!current()) return
      protectedRecord = { id: slot.draft?.id, revision: slot.draft?.revision }
      const candidate = (await slot.drafts.read(identity, documentId)).records.find(record => record.id === value.id && record.revision === value.revision && record.token === value.token)
      if (!current()) return
      if (!candidate) { slot.state = { ...slot.state, recoveryChanged: true }; return }
      const answer = await this.#client.readDocument(slot.state.directory)
      if (!current()) return
      if (answer.document !== slot.state.directory || answer.content.id !== documentId) { slot.state = { ...slot.state, error: 'document-identity-changed' }; return }
      const [localHash, remoteHash] = await Promise.all([digest(candidate.content), digest(answer.content)])
      if (!current()) return
      const origins = [...new Map([...(candidate.origins ?? []), { id: candidate.id, revision: candidate.revision, token: candidate.token }].map(value => [JSON.stringify([value.id, value.revision, value.token]), value])).values()]
      if (localHash === remoteHash && !candidate.composing) {
        const settled = await slot.drafts.settle(identity, origins)
        if (!current()) return
        slot.persistFailure = !settled
        return
      }
      const conflict = answer.version !== candidate.baseVersion && remoteHash !== candidate.baseHash && remoteHash !== candidate.pendingHash
      const version = remoteHash === candidate.pendingHash || remoteHash === candidate.baseHash ? answer.version : candidate.baseVersion
      const baseHash = remoteHash === candidate.pendingHash ? remoteHash : candidate.baseHash
      const record = await slot.drafts.fork(identity, { content: candidate.content, baseVersion: version, baseHash, input: input + 1,
        pendingHash: candidate.pendingHash, composing: Boolean(candidate.composing), origins })
      if (!current()) { if (record) slot.drafts.archive(record); return }
      if (!record) { slot.persistFailure = true; slot.state = { ...slot.state, storageFailure: true }; return }
      clearTimeout(slot.timer); slot.timer = undefined
      if (slot.draft) slot.drafts.archive(slot.draft)
      slot.input = input + 1; slot.baseHash = baseHash; slot.pendingHash = candidate.pendingHash; slot.draft = record; slot.draftOrigins = origins
      slot.backup = undefined; slot.persistFailure = false
      adopted = true
      slot.compositions.clear()
      slot.state = { ...slot.state, content: candidate.content, version, fingerprint: answer.fingerprint, dirty: true, restored: true, composing: false,
        backupPending: false, storageFailure: slot.legacyFailure === 'write', reset: slot.state.reset + 1,
        error: conflict ? 'document-version-changed' : candidate.composing ? 'document-composition-interrupted' : undefined, issues: answer.issues }
    } catch (error) {
      if (current()) slot.state = { ...slot.state, error: this.#error(error), issues: this.#issues(error) }
    } finally {
      if (!this.#disposed && this.#slots.get(slot.state.directory) === slot && slot.state.identity === identity && slot.recoveryOperation === operation) {
        if (!adopted && slot.input === input && pendingSave && slot.timer === undefined) this.#schedule(slot)
        slot.state = { ...slot.state, recovering: false }; this.#emit(slot); void this.#readDrafts(slot)
      }
    }
  }

  async forgetDraft(value: DocumentDraftReference): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.identity || !slot.state.content || slot.state.recovering || slot.flight || slot.assetFlight || slot.state.composing || this.#disposed) return
    const identity = slot.state.identity, documentId = slot.state.content.id, input = slot.input, read = slot.read
    const operation = slot.recoveryOperation = (slot.recoveryOperation ?? 0) + 1
    const current = () => !this.#disposed && this.#active === slot.state.directory && this.#slots.get(slot.state.directory) === slot && slot.state.identity === identity && slot.input === input && slot.read === read && slot.recoveryOperation === operation && !slot.state.composing && !slot.flight && !slot.assetFlight
    slot.state = { ...slot.state, recovering: true }; this.#emit(slot)
    try {
      const candidate = (await slot.drafts.read(identity, documentId)).records.find(record => record.id === value.id && record.revision === value.revision && record.token === value.token)
      if (!current()) return
      if (candidate?.owned && candidate.id === slot.draft?.id) return
      if (!candidate) slot.state = { ...slot.state, recoveryChanged: true }
      else {
        const settled = await slot.drafts.settle(identity, [value])
        if (!current()) return
        slot.persistFailure = !settled
        slot.state = { ...slot.state, recoveryChanged: false, storageFailure: Boolean(slot.persistFailure || slot.legacyFailure === 'write') }
      }
    } catch { if (current()) { slot.persistFailure = true; slot.state = { ...slot.state, storageFailure: true } } }
    finally {
      if (!this.#disposed && this.#slots.get(slot.state.directory) === slot && slot.state.identity === identity && slot.recoveryOperation === operation) {
        slot.state = { ...slot.state, recovering: false }; this.#emit(slot); void this.#readDrafts(slot)
      }
    }
  }

  dispose(): void {
    this.#disposed = true; this.#syncLeaveProtection(); this.close()
    if (typeof window !== 'undefined') { window.removeEventListener('storage', this.#storageChanged); window.removeEventListener('focus', this.#draftFocus) }
    for (const slot of this.#slots.values()) { clearTimeout(slot.timer); this.#persist(slot); slot.drafts.close() }
  }
}
