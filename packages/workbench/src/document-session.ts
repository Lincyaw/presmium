import { validateDocument } from '@lincyaw/kernel'
import type { DocumentAnswer, DocumentChangeAnswer, DocumentIssue, TeachingDocument } from '@lincyaw/kernel'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'

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
  reset: number
  error?: string
  issues: DocumentIssue[]
}
interface Draft { content: TeachingDocument, baseVersion: string, baseHash: string, input: number, pendingHash?: string, composing?: boolean }
interface Slot {
  state: DocumentSessionState
  input: number
  baseHash: string
  storage: string
  flight?: { id: string, input: number, content: TeachingDocument, baseVersion: string, hash?: string }
  timer?: ReturnType<typeof setTimeout>
  refreshed?: boolean
  pendingHash?: string
  projectObservation?: string
}

const serialize = (value: TeachingDocument) => JSON.stringify(value, (_, entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry)
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
  #active?: string
  #opening = 0
  #unsubscribe?: () => void
  constructor(client: WorkspaceClient, changed: (state: DocumentSessionState) => void) { this.#client = client; this.#changed = changed }

  async open(directory: string): Promise<void> {
    const opening = ++this.#opening
    this.#active = directory
    this.#unsubscribe?.()
    const cached = this.#slots.get(directory)
    this.#changed(cached ? { ...cached.state } : { directory, loading: true, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: [] })
    try {
      const [info, answer] = await Promise.all([this.#client.readWorkbenchInfo(), this.#client.readDocument(directory)])
      if (this.#active !== directory || opening !== this.#opening) return
      let slot = this.#slots.get(directory)
      if (!slot) {
        slot = { input: 0, baseHash: await digest(answer.content), storage: `presmium.document.v1:${JSON.stringify([info.root, answer.content.id])}`, state: { directory, identity: JSON.stringify([info.root, answer.content.id]), content: answer.content, version: answer.version, fingerprint: answer.fingerprint, loading: false, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: answer.issues } }
        this.#slots.set(directory, slot)
        await this.#restore(slot, answer)
      } else await this.#adopt(slot, answer)
      if (this.#active !== directory || opening !== this.#opening) return
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
        if (current.flight) { current.refreshed = true; return }
        void this.refresh(directory)
      }, () => {})
    } catch (error) {
      if (this.#active === directory && opening === this.#opening) this.#changed({ ...(cached?.state ?? { directory, dirty: false, saving: false, restored: false, composing: false, storageFailure: false, reset: 0, issues: [] }), loading: false, error: this.#error(error), issues: this.#issues(error) })
    }
  }

  close(): void { this.interrupt(); this.#active = undefined; this.#opening++; this.#unsubscribe?.(); this.#unsubscribe = undefined }
  #prune(): void {
    for (const [directory, slot] of this.#slots) {
      if (this.#slots.size <= 8) return
      if (directory === this.#active || slot.flight || slot.state.dirty || slot.state.composing) continue
      clearTimeout(slot.timer)
      this.#slots.delete(directory)
    }
  }
  #emit(slot: Slot): void { if (this.#active === slot.state.directory) this.#changed({ ...slot.state }) }
  #error(error: unknown): string { return error instanceof WorkspaceServerError ? error.answer.error ?? 'document-request-failed' : 'document-disconnected' }
  #issues(error: unknown): DocumentIssue[] { const value = error instanceof WorkspaceServerError ? (error.answer as { issues?: DocumentIssue[] }).issues : undefined; return Array.isArray(value) ? value : [] }

  async refresh(directory = this.#active): Promise<void> {
    if (directory === undefined) return
    const slot = this.#slots.get(directory)
    if (!slot) { if (directory === this.#active) await this.open(directory); return }
    if (slot.flight) { slot.refreshed = true; return }
    try { await this.#adopt(slot, await this.#client.readDocument(directory)); this.#persist(slot); this.#emit(slot) }
    catch (error) { slot.state = { ...slot.state, error: this.#error(error), issues: this.#issues(error) }; this.#emit(slot) }
  }

  async #adopt(slot: Slot, answer: DocumentAnswer): Promise<void> {
    if (answer.content.id !== slot.state.content?.id) { slot.state = { ...slot.state, error: 'document-identity-changed' }; return }
    if (answer.version === slot.state.version) {
      if (answer.fingerprint !== slot.state.fingerprint) slot.state = { ...slot.state, fingerprint: answer.fingerprint, issues: answer.issues }
      return
    }
    const remoteHash = await digest(answer.content)
    if (slot.state.dirty || slot.state.composing) {
      if (remoteHash === await digest(slot.state.content!) && !slot.state.composing) {
        slot.baseHash = remoteHash
        slot.pendingHash = undefined
        slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, dirty: false, error: undefined, issues: answer.issues }
      } else if (remoteHash === slot.pendingHash) {
        slot.baseHash = remoteHash; slot.pendingHash = undefined
        slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, error: undefined, issues: answer.issues }
      } else if (remoteHash === slot.baseHash) slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, issues: answer.issues }
      else slot.state = { ...slot.state, error: 'document-version-changed', issues: answer.issues }
      return
    }
    slot.baseHash = remoteHash
    slot.state = { ...slot.state, version: answer.version, fingerprint: answer.fingerprint, content: answer.content, reset: slot.state.reset + 1, error: undefined, issues: answer.issues }
  }

  record(content: TeachingDocument): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || content.id !== slot.state.content?.id) return
    slot.input++
    slot.state = { ...slot.state, content: structuredClone(content), dirty: true }
    this.#persist(slot); this.#emit(slot)
    clearTimeout(slot.timer)
    if (!slot.state.restored && !slot.state.error && !slot.state.composing) slot.timer = setTimeout(() => { void this.#save(slot) }, 600)
  }

  replace(content: TeachingDocument): void {
    this.record(content)
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (slot) { slot.state.reset++; this.#emit(slot) }
  }

  composition(composing: boolean): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot) return
    slot.state = { ...slot.state, composing }
    this.#persist(slot); this.#emit(slot)
    if (!composing && !slot.state.error && !slot.state.restored) void this.#save(slot)
  }
  interrupt(): void {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot?.state.composing) return
    slot.state = { ...slot.state, composing: false, restored: true, error: 'document-composition-interrupted' }
    this.#persist(slot); this.#emit(slot)
  }

  async #save(slot: Slot): Promise<void> {
    clearTimeout(slot.timer)
    if (slot.flight || !slot.state.dirty || slot.state.composing || slot.state.restored || slot.state.error || !slot.state.content || !slot.state.version) return
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

  async retry(): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || slot.flight || slot.state.composing) return
    const previousError = slot.state.error
    slot.state = { ...slot.state, restored: false, error: undefined }
    await this.refresh(slot.state.directory)
    if (slot.state.error) { if (!previousError) this.#emit(slot); return }
    await this.#save(slot)
  }
  async discard(): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot || slot.flight) return
    try {
      const answer = await this.#client.readDocument(slot.state.directory)
      slot.input++; slot.baseHash = await digest(answer.content)
      slot.pendingHash = undefined
      slot.state = { ...slot.state, content: answer.content, version: answer.version, fingerprint: answer.fingerprint, dirty: false, restored: false, composing: false, reset: slot.state.reset + 1, error: undefined, issues: answer.issues }
      this.#persist(slot); this.#emit(slot)
    } catch (error) { slot.state = { ...slot.state, error: this.#error(error) }; this.#emit(slot) }
  }
  async flush(): Promise<void> {
    const slot = this.#active === undefined ? undefined : this.#slots.get(this.#active)
    if (!slot) return
    if (slot.state.composing || slot.state.restored || slot.state.error) throw new Error(slot.state.error ?? 'document-draft-unconfirmed')
    const started = Date.now()
    while (slot.state.dirty || slot.flight) {
      if (slot.state.error || slot.state.composing || slot.state.restored) throw new Error(slot.state.error ?? 'document-draft-unconfirmed')
      if (Date.now() - started > 30000) throw new Error('document-save-timeout')
      await this.#save(slot)
      if (slot.flight) await new Promise(resolve => setTimeout(resolve, 20))
    }
  }

  #persist(slot: Slot): void {
    try {
      if (!slot.state.dirty && !slot.state.composing && !slot.flight) sessionStorage.removeItem(slot.storage)
      else sessionStorage.setItem(slot.storage, JSON.stringify({ content: slot.state.content!, baseVersion: slot.state.version!, baseHash: slot.baseHash, input: slot.input, pendingHash: slot.flight?.hash ?? slot.pendingHash, composing: slot.state.composing } satisfies Draft))
      slot.state.storageFailure = false
    } catch { slot.state.storageFailure = true }
  }
  async #restore(slot: Slot, answer: DocumentAnswer): Promise<void> {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(slot.storage) ?? 'null')
      if (!value || typeof value !== 'object') return
      const draft = value as Draft, checked = validateDocument(draft.content)
      if (!checked.document || checked.document.id !== answer.content.id || checked.issues.some(issue => issue.severity === 'error') || typeof draft.baseVersion !== 'string' || typeof draft.baseHash !== 'string') return
      const localHash = await digest(checked.document), remoteHash = await digest(answer.content)
      if (localHash === remoteHash && !draft.composing) { sessionStorage.removeItem(slot.storage); return }
      const conflict = answer.version !== draft.baseVersion && remoteHash !== draft.baseHash && remoteHash !== draft.pendingHash
      slot.input = Number.isSafeInteger(draft.input) ? draft.input : 1
      slot.state = { ...slot.state, content: checked.document, dirty: true, restored: true, error: conflict ? 'document-version-changed' : draft.composing ? 'document-composition-interrupted' : undefined }
      if (remoteHash === draft.pendingHash || remoteHash === draft.baseHash) slot.state.version = answer.version
      else slot.state.version = draft.baseVersion
      slot.baseHash = remoteHash === draft.pendingHash ? remoteHash : draft.baseHash
      slot.pendingHash = draft.pendingHash
    } catch { slot.state.storageFailure = true }
  }
  dispose(): void { this.close(); for (const slot of this.#slots.values()) { clearTimeout(slot.timer); this.#persist(slot) } }
}
