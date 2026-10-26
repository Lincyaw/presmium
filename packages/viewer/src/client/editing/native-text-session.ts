import { createStore } from '@lincyaw/host'
import { reportPreview } from '@lincyaw/kernel'
import type { PreviewAnchor, PreviewCommand, PreviewTextEdit, PreviewTextHandle } from '@lincyaw/kernel'
import type { Viewer } from '../viewer-state.ts'
import { draftScope } from './draft-scope.ts'

export interface NativeTextDraft extends PreviewTextEdit {
  after: string
  version: number
  editing: boolean
  composing: boolean
  review: boolean
  restored?: boolean
  error?: string
}
interface Flight extends PreviewTextEdit { request: number; version: number; after: string }
const sessions = new WeakMap<Viewer, NativeTextSession>()
const keyOf = (target: PreviewAnchor) => JSON.stringify([target.section, target.block ?? ''])
// A reloaded iframe must not reuse a request from its previous module instance.
const random = typeof crypto === 'undefined' ? undefined : crypto.getRandomValues(new Uint32Array(2))
let request = random ? (random[0]! & 0xfffff) * 0x100000000 + random[1]! : Date.now() * 1024
const storageKey = (viewer: Viewer) => `presmium.native-text.v1:${draftScope(viewer)}`

export function nativeTextSession(viewer: Viewer): NativeTextSession {
  let session = sessions.get(viewer)
  if (!session) { session = new NativeTextSession(viewer); sessions.set(viewer, session) }
  return session
}

export async function settleNativeTextEdits(viewer: Viewer): Promise<void> {
  let session = sessions.get(viewer)
  if (!session && document.documentElement.hasAttribute('data-preview-picking')) {
    try { if (sessionStorage.getItem(storageKey(viewer))) session = nativeTextSession(viewer) }
    catch { throw new Error('native-storage') }
  }
  await session?.settled()
}

/** The DOM is a text lens. Only a confirmed workspace write advances its source baseline. */
export class NativeTextSession {
  readonly state = createStore<Record<string, NativeTextDraft>>({})
  readonly storageFailure = createStore(false)
  readonly unreadableDraft = createStore<string | undefined>(undefined)
  #viewer: Viewer
  #storage: string
  #version = 0
  #token = 0
  #flight?: Flight
  #timeout?: ReturnType<typeof setTimeout>
  #waiters = new Set<() => void>()
  #unsubscribe?: () => void
  constructor(viewer: Viewer) {
    this.#viewer = viewer
    this.#storage = storageKey(viewer)
    this.#restore()
    this.#unsubscribe = viewer.options.editingActive?.subscribe(() => {
      if (!this.#active()) { this.#interruptFields(); return }
      this.announce()
      this.#flush()
    })
    window.addEventListener('presmium:edit-result', this.#result)
    window.addEventListener('pagehide', this.#pagehide)
  }
  #active() { return this.#viewer.options.editingActive?.getSnapshot() ?? true }
  #dirty(draft: NativeTextDraft): boolean { return draft.after !== draft.before || draft.composing || draft.review || Boolean(this.#flight && keyOf(this.#flight.target) === keyOf(draft.target)) }
  #set(key: string, draft?: NativeTextDraft): void {
    const entries = { ...this.state.getSnapshot() }
    if (draft) entries[key] = draft
    else delete entries[key]
    this.state.set(entries)
    this.#persist()
    this.announce()
    for (const check of [...this.#waiters]) check()
  }
  announce(): void {
    reportPreview({ type: 'native-draft', dirty: Boolean(this.#flight) || Object.values(this.state.getSnapshot()).some(draft => this.#dirty(draft)) })
  }
  begin(edit: PreviewTextEdit): PreviewTextHandle | undefined {
    const key = keyOf(edit.target)
    const prior = this.state.getSnapshot()[key]
    // A recovered or conflicted input is reviewed in its own visible text field;
    // opening the rendered source must not silently replace that input.
    if (prior && (this.#dirty(prior) || prior.error)) {
      document.querySelector<HTMLElement>(`[data-native-text-key="${CSS.escape(key)}"] textarea`)?.focus()
      return undefined
    }
    const token = ++this.#token
    const initial: NativeTextDraft = prior ? { ...prior, editing: true } : { ...edit, after: edit.before, version: ++this.#version, editing: true, composing: false, review: false }
    this.#set(key, initial)
    const update = (after: string, composing: boolean) => {
      if (token !== this.#token) return
      const current = this.state.getSnapshot()[key]
      if (!current) return
      if (current.after === after && current.composing === composing) return
      this.#set(key, { ...current, after, composing, version: ++this.#version })
    }
    return {
      change: update,
      finish: (after, interrupted) => {
        if (token !== this.#token) return
        update(after, false)
        const current = this.state.getSnapshot()[key]
        if (!current) return
        const review = Boolean(interrupted && (current.after !== current.before || this.#flight))
        const next = { ...current, editing: false, composing: false, review, ...(review ? { error: 'native-composition' } : {}) }
        this.#set(key, this.#dirty(next) ? next : undefined)
        this.#flush()
      },
      cancel: () => {
        if (token !== this.#token) return
        // Escape cancels this DOM session, not a previously committed draft or
        // an already dispatched source write for the same target.
        const current = this.state.getSnapshot()[key]
        if (prior && current) this.#set(key, { ...current, after: prior.after, editing: false, composing: false, version: ++this.#version })
        else if (current && this.#flight && keyOf(this.#flight.target) === key) this.#set(key, { ...current, after: this.#flight.after, editing: false, composing: false, version: ++this.#version })
        else this.#set(key)
        this.#flush()
      },
    }
  }
  change(target: PreviewAnchor, after: string): void {
    const key = keyOf(target), current = this.state.getSnapshot()[key]
    if (!current) return
    this.#set(key, { ...current, after, version: ++this.#version })
  }
  composition(target: PreviewAnchor, composing: boolean): void {
    const key = keyOf(target), current = this.state.getSnapshot()[key]
    if (!current) return
    this.#set(key, { ...current, composing })
  }
  interrupt(target: PreviewAnchor): void {
    const key = keyOf(target), current = this.state.getSnapshot()[key]
    if (!current?.composing) return
    this.#set(key, { ...current, composing: false, review: true, error: 'native-composition' })
  }
  retry(target: PreviewAnchor): void {
    const key = keyOf(target), current = this.state.getSnapshot()[key]
    if (!current || current.editing || current.composing || this.#flight && keyOf(this.#flight.target) === key) return
    this.#set(key, { ...current, error: undefined, restored: undefined, review: false })
    this.#flush()
  }
  discard(target: PreviewAnchor): void {
    const key = keyOf(target)
    if (this.#flight && keyOf(this.#flight.target) === key) return
    this.#set(key)
  }
  discardUnreadable(): void {
    this.unreadableDraft.set(undefined)
    this.#persist()
  }
  saving(target: PreviewAnchor): boolean { return Boolean(this.#flight && keyOf(this.#flight.target) === keyOf(target)) }
  #flush(): void {
    if (this.#flight || !this.#active()) return
    const next = Object.entries(this.state.getSnapshot()).find(([, draft]) => !draft.editing && !draft.composing && !draft.review && !draft.error && draft.after !== draft.before)
    if (!next) return
    const [key, draft] = next
    if (draft.before.length > 200_000 || draft.after.length > 200_000) {
      this.#set(key, { ...draft, error: 'native-format' })
      return
    }
    this.#flight = { target: draft.target, before: draft.before, after: draft.after, revision: draft.revision, binding: draft.binding, request: ++request, version: draft.version }
    this.#timeout = setTimeout(() => this.#fail('save-timeout'), 30_000)
    this.#set(key, draft)
    const { target, before, after, revision, binding, request: id } = this.#flight
    reportPreview({ type: 'edited', target, before, after, revision, binding, request: id })
  }
  #result = (event: Event): void => {
    const answer = (event as CustomEvent<Extract<PreviewCommand, { type: 'edit-result' }>>).detail
    const flight = this.#flight
    if (!flight || answer.request !== flight.request || keyOf(answer.target) !== keyOf(flight.target)) return
    if (answer.error) return this.#fail(answer.error)
    if (!answer.revision || !answer.binding) return this.#fail('native-confirmation')
    clearTimeout(this.#timeout)
    this.#flight = undefined
    const key = keyOf(flight.target), current = this.state.getSnapshot()[key]
    if (current) {
      // A stale ACK cannot clear text entered after the frozen request. Its new
      // binding does let that newer draft continue from the confirmed source.
      const next = { ...current, before: flight.after, revision: answer.revision, binding: answer.binding }
      this.#set(key, !next.editing && !this.#dirty(next) ? undefined : next)
    } else this.announce()
    this.#flush()
  }
  #fail(error: string): void {
    const flight = this.#flight
    if (!flight) return
    clearTimeout(this.#timeout)
    this.#flight = undefined
    const key = keyOf(flight.target), current = this.state.getSnapshot()[key]
    if (current) this.#set(key, { ...current, error })
    this.#flush()
  }
  settled(): Promise<void> {
    this.announce()
    this.#flush()
    return new Promise((resolve, reject) => {
      let done = false
      const finish = (error?: string) => {
        if (done) return
        done = true
        clearTimeout(timeout)
        this.#waiters.delete(check)
        error ? reject(new Error(error)) : resolve()
      }
      const check = () => {
        if (this.unreadableDraft.getSnapshot() !== undefined) return finish('native-storage')
        const drafts = Object.values(this.state.getSnapshot())
        const failure = drafts.find(draft => draft.error || draft.review)
        if (failure) return finish(failure.error ?? 'native-review')
        if (!this.#flight && !drafts.some(draft => this.#dirty(draft))) finish()
      }
      const timeout = setTimeout(() => finish('save-timeout'), 30_000)
      this.#waiters.add(check)
      check()
    })
  }
  #persist(): void {
    // Never replace an unknown backup merely because a newer editor mounted.
    if (this.unreadableDraft.getSnapshot() !== undefined) { this.storageFailure.set(true); return }
    const entries = Object.values(this.state.getSnapshot()).filter(draft => this.#dirty(draft))
    try {
      if (entries.length) sessionStorage.setItem(this.#storage, JSON.stringify(entries))
      else sessionStorage.removeItem(this.#storage)
      this.storageFailure.set(false)
    } catch { this.storageFailure.set(true) }
  }
  #restore(): void {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(this.#storage)
      if (raw === null) return
      const entries: unknown = JSON.parse(raw)
      if (!Array.isArray(entries)) throw new Error('native-storage')
      const restored: Record<string, NativeTextDraft> = {}
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || !entry.target || typeof entry.target.section !== 'string' || entry.target.block !== undefined && typeof entry.target.block !== 'string' || !['before', 'after', 'binding', 'revision'].every(field => typeof entry[field] === 'string') || !entry.binding || !entry.revision) throw new Error('native-storage')
        const composing = Boolean(entry.composing)
        const draft: NativeTextDraft = { target: { section: entry.target.section, ...entry.target.block === undefined ? {} : { block: entry.target.block } }, before: entry.before, after: entry.after, binding: entry.binding, revision: entry.revision, version: ++this.#version, composing: false, editing: false, review: true, restored: true, ...composing ? { error: 'native-composition' } : {} }
        restored[keyOf(draft.target)] = draft
      }
      this.state.set(restored)
    } catch { if (raw !== null) this.unreadableDraft.set(raw); this.storageFailure.set(true) }
  }
  #interruptFields(): void {
    for (const draft of Object.values(this.state.getSnapshot())) if (!draft.editing) this.interrupt(draft.target)
  }
  #pagehide = (): void => { this.#interruptFields(); this.#persist() }
  dispose(): void {
    this.#persist()
    clearTimeout(this.#timeout)
    this.#unsubscribe?.()
    window.removeEventListener('presmium:edit-result', this.#result)
    window.removeEventListener('pagehide', this.#pagehide)
    for (const check of [...this.#waiters]) check()
  }
}
