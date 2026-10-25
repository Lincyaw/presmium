import { errorMessage } from '@lincyaw/kernel'
import type { IRDocument, IRSection } from '@lincyaw/kernel'
import { narrationTargetSignature, readStepNarration } from './narration.ts'
import type { StepNarrationDraft } from './narration.ts'
import type { WorkspaceClient } from './workspace-client.ts'

export interface NarrationEdit {
  document: string
  draft?: StepNarrationDraft
  text: string
  mode: StepNarrationDraft['mode']
  version: number
  dirty: boolean
  saving?: boolean
  loading?: boolean
  composing?: boolean
  failure?: string
  recoveryFailed?: boolean
  baseline?: string
}

interface Recovery { signature: string, text: string, mode: StepNarrationDraft['mode'], interrupted?: true }
const sessions = new WeakMap<WorkspaceClient, NarrationDrafts>()
const PREFIX = 'presmium.narration-draft.v1:'
export const narrationDraftKey = (document: string, section: string, step: number) => JSON.stringify([document, section, step])

/** Drafts outlive their panel. Browser recovery is scoped to the workspace, target and source baseline. */
export class NarrationDrafts {
  #state: Record<string, NarrationEdit> = {}
  readonly #listeners = new Set<() => void>()
  readonly #storage = new Map<string, string>()
  readonly #client: WorkspaceClient
  constructor(client: WorkspaceClient) { this.#client = client }
  readonly snapshot = () => this.#state
  readonly subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }
  dirty(document: string): boolean { return Object.values(this.#state).some(entry => entry.document === document && entry.dirty) }
  #set(key: string, entry: NarrationEdit): void {
    this.#state = { ...this.#state, [key]: entry }
    for (const listener of this.#listeners) listener()
  }
  async open(document: string, doc: IRDocument, section: IRSection, step: number): Promise<void> {
    const key = narrationDraftKey(document, section.id, step)
    const known = this.#state[key]
    if (known?.dirty || known?.saving || known?.loading || known?.composing) return
    const pending: NarrationEdit = { document, text: '', mode: 'during', version: known?.version ?? 0, dirty: false, loading: true }
    this.#set(key, pending)
    try {
      const [draft, info] = await Promise.all([readStepNarration(this.#client, doc, section, step), this.#client.readWorkbenchInfo()])
      if (this.#state[key] !== pending) return
      const storage = `${PREFIX}${JSON.stringify([info.root, document, section.id, step])}`
      this.#storage.set(key, storage)
      let recovery: Recovery | undefined
      let recoveryFailed = false
      try {
        const raw = globalThis.localStorage?.getItem(storage)
        const value: unknown = raw ? JSON.parse(raw) : undefined
        if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>
          if (typeof record.signature === 'string' && typeof record.text === 'string' && (record.mode === 'during' || record.mode === 'after')) recovery = record as unknown as Recovery
        }
      } catch { recoveryFailed = true }
      const dirty = recovery !== undefined && (recovery.text !== draft.text || recovery.mode !== draft.mode)
      this.#set(key, {
        document, draft, text: recovery?.text ?? draft.text, mode: recovery?.mode ?? draft.mode,
        version: pending.version + (dirty ? 1 : 0), dirty, recoveryFailed, baseline: recovery?.signature,
        ...(dirty && recovery?.signature !== narrationTargetSignature(draft) ? { failure: 'narration-conflict' } : dirty && recovery?.interrupted ? { failure: 'narration-composition' } : {}),
      })
    } catch (error) {
      if (this.#state[key] === pending) this.#set(key, { ...pending, loading: false, failure: errorMessage(error) })
    }
  }
  change(key: string, patch: Pick<NarrationEdit, 'text'> | Pick<NarrationEdit, 'mode'>): void {
    const entry = this.#state[key]
    if (!entry?.draft) return
    const next = { ...entry, ...patch, version: entry.version + 1 }
    next.dirty = next.text !== entry.draft.text || next.mode !== entry.draft.mode
    // A conflict requires an explicit discard/reload. Ordinary request failures can be retried after another edit.
    if (next.failure !== 'narration-conflict') next.failure = undefined
    this.#write(key, next)
  }
  composition(key: string, composing: boolean): void {
    const entry = this.#state[key]
    if (entry && entry.composing !== composing) this.#write(key, { ...entry, composing })
  }
  interruptComposition(key: string): void {
    const entry = this.#state[key]
    if (entry?.composing) this.#write(key, { ...entry, composing: false, ...entry.dirty && entry.failure !== 'narration-conflict' ? { failure: 'narration-composition' } : {} })
  }
  #write(key: string, entry: NarrationEdit): void {
    try {
      const storage = this.#storage.get(key)
      if (!storage) throw new Error('recovery-unavailable')
      if (entry.dirty && entry.draft) globalThis.localStorage?.setItem(storage, JSON.stringify({ signature: entry.baseline ?? narrationTargetSignature(entry.draft), text: entry.text, mode: entry.mode, ...entry.composing || entry.failure === 'narration-composition' ? { interrupted: true as const } : {} } satisfies Recovery))
      else globalThis.localStorage?.removeItem(storage)
      entry = { ...entry, recoveryFailed: false }
    } catch { entry = { ...entry, recoveryFailed: true } }
    this.#set(key, entry)
  }
  async save(key: string, write: (draft: StepNarrationDraft, text: string, mode: StepNarrationDraft['mode']) => Promise<StepNarrationDraft>): Promise<void> {
    const submitted = this.#state[key]
    if (!submitted?.draft || !submitted.dirty || submitted.saving || submitted.composing || submitted.failure === 'narration-conflict') return
    this.#set(key, { ...submitted, saving: true, failure: undefined })
    try {
      const confirmed = await write(submitted.draft, submitted.text, submitted.mode)
      const current = this.#state[key]!
      const same = current.version === submitted.version
      const text = same ? confirmed.text : current.text
      const mode = same ? confirmed.mode : current.mode
      this.#write(key, { ...current, draft: confirmed, baseline: undefined, text, mode, dirty: text !== confirmed.text || mode !== confirmed.mode, saving: false, failure: undefined })
    } catch (error) {
      const current = this.#state[key]!
      this.#set(key, { ...current, saving: false, failure: errorMessage(error) })
    }
  }
  discard(key: string): void {
    const entry = this.#state[key]
    if (!entry || entry.saving) return
    this.#write(key, { ...entry, dirty: false, failure: undefined })
    const { [key]: _removed, ...rest } = this.#state
    this.#state = rest
    for (const listener of this.#listeners) listener()
  }
}

export function narrationDrafts(client: WorkspaceClient): NarrationDrafts {
  let session = sessions.get(client)
  if (!session) { session = new NarrationDrafts(client); sessions.set(client, session) }
  return session
}
