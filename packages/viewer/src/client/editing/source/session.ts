import { createStore } from '@lincyaw/host'
import type { Store } from '@lincyaw/host'
import { irBlocks, reportPreview } from '@lincyaw/kernel'
import type { PreviewCommand, PreviewSource } from '@lincyaw/kernel'
import type { Viewer } from '../../viewer-state.ts'
import { bodySaveQueue } from '../save-queue.ts'
import { validateSource } from './syntax.ts'

export type SourcePart = PreviewSource['part']
export interface SourceView {
  mode: 'source' | 'preview'
  part: SourcePart
  applying?: boolean
  step?: number
  restore?: boolean
}
interface PendingSave {
  content: string
  preview: boolean
}
export interface SourceState {
  source?: PreviewSource
  draft?: string
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'failed'
  error?: string
  verified: boolean
  pending?: PendingSave
}
interface Entry {
  section: string
  block: string
  part: SourcePart
  state: Store<SourceState>
}
type SourceAnswer = Extract<PreviewCommand, { type: 'source-result' | 'source-saved' | 'source-created' }>
interface Request {
  type: SourceAnswer['type']
  section: string
  block?: string
  resolve(answer: SourceAnswer): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}
interface StoredSession {
  active?: string
  views: Record<string, SourceView>
  entries: Record<string, { section: string; block: string; part: SourcePart; source?: PreviewSource; draft?: string; pending?: PendingSave }>
}
const sessions = new WeakMap<Viewer, SourceSession>()
let nextRequest = 0
const keyOf = (section: string, block: string) => JSON.stringify([section, block])
const entryKey = (section: string, block: string, part: SourcePart) => JSON.stringify([section, block, part])
const errorOf = (error: unknown) => error instanceof Error ? error.message : String(error)
export function sourceDirty(state: SourceState): boolean {
  return state.source !== undefined && state.draft !== undefined && state.draft !== state.source.content
}
export function sourceSession(viewer: Viewer): SourceSession {
  let session = sessions.get(viewer)
  if (!session) {
    session = new SourceSession(viewer)
    sessions.set(viewer, session)
  }
  return session
}

/** A document has one bridge listener; source drafts survive both block unmounts and code-triggered page reloads. */
export class SourceSession {
  #viewer: Viewer
  #storage: string
  #views = new Map<string, Store<SourceView>>()
  #entries = new Map<string, Entry>()
  #requests = new Map<number, Request>()
  #reads = new Map<string, Promise<PreviewSource>>()
  #saves = new Map<string, Promise<void>>()
  #serial: Promise<unknown> = Promise.resolve()
  #disposed = false
  #refresh = 0
  #announceFrame = 0
  #restoreFrame = 0
  #active?: string
  #restored = new Set<string>()
  #unsubscribe: () => void
  #unfollow: () => void

  constructor(viewer: Viewer) {
    this.#viewer = viewer
    this.#storage = `presmium.block-source:${viewer.doc.getSnapshot().meta.entry}`
    this.#restore()
    this.#unfollow = viewer.position.subscribe(() => {
      const requested = viewer.position.getSnapshot()
      // show() sets restoring after go(); a scroll observer only calls go().
      // Wait one microtask so scrolling through other blocks cannot replace an explicit source step.
      void Promise.resolve().then(() => {
        if (this.#disposed || !viewer.restoring.getSnapshot()) return
        const current = viewer.position.getSnapshot()
        if (current.section !== requested.section || current.step !== requested.step) return
        let changed = false
        for (const [key, store] of this.#views) {
          const [section, block] = JSON.parse(key) as [string, string]
          const view = store.getSnapshot()
          if (view.mode === 'source' && section === current.section && this.#contains(section, block, current.step) && view.step !== current.step) {
            store.set({ ...view, step: current.step })
            changed = true
          }
          if (view.restore && (section !== current.section || view.step !== current.step)) {
            store.set({ ...store.getSnapshot(), restore: undefined })
            this.#restored.delete(key)
            changed = true
          }
        }
        if (changed) this.#persist()
      })
    })
    this.#unsubscribe = viewer.doc.subscribe(() => {
      cancelAnimationFrame(this.#refresh)
      this.#refresh = requestAnimationFrame(() => {
        if (this.#disposed || this.#saves.size > 0) return
        for (const [key, view] of this.#views) {
          if (view.getSnapshot().mode !== 'source') continue
          const [section, block] = JSON.parse(key) as [string, string]
          void this.read(section, block, view.getSnapshot().part, true).catch(() => {})
        }
      })
    })
    window.addEventListener('presmium:source-result', this.#answer)
    window.addEventListener('presmium:source-saved', this.#answer)
    window.addEventListener('presmium:source-created', this.#answer)
    window.addEventListener('pagehide', this.#pagehide)
  }

  view(section: string, block: string, part: SourcePart = 'definition'): Store<SourceView> {
    const key = keyOf(section, block)
    let view = this.#views.get(key)
    if (!view) {
      view = createStore<SourceView>({ mode: 'preview', part })
      this.#views.set(key, view)
    }
    return view
  }

  state(section: string, block: string, part: SourcePart): Store<SourceState> {
    return this.#entry(section, block, part).state
  }

  #scope(section: string, id: string) {
    const page = this.#viewer.section(section)
    const block = page && [...irBlocks(page.blocks)].find(block => block.id === id)
    if (!page || !block) return undefined
    return { from: block.at, to: Math.max(block.at, Math.min(page.steps, block.span === undefined ? page.steps : block.at + block.span)) }
  }

  #step(section: string, block: string, requested?: number): number | undefined {
    const range = this.#scope(section, block)
    if (!range) return requested
    return Math.min(range.to, Math.max(range.from, requested ?? range.from))
  }

  #contains(section: string, block: string, step: number): boolean {
    const range = this.#scope(section, block)
    return range !== undefined && step >= range.from && step <= range.to
  }

  focus(section: string, block: string): void {
    const key = keyOf(section, block)
    if (this.#active === key) return
    this.#active = key
    for (const [other, store] of this.#views) {
      if (other === key || !store.getSnapshot().restore) continue
      store.set({ ...store.getSnapshot(), restore: undefined })
      this.#restored.delete(other)
    }
    this.#persist()
  }

  isActive(section: string, block: string): boolean {
    return this.#active === keyOf(section, block)
  }

  /** Force the parent save status after mounting/resuming, once the preview bridge is connected. */
  announce(): void {
    cancelAnimationFrame(this.#announceFrame)
    this.#announceFrame = requestAnimationFrame(() => this.#announce())
  }

  #announce(): void {
    if (this.#disposed) return
    reportPreview({ type: 'source-draft', dirty: [...this.#entries.values()].some(entry => {
      const state = entry.state.getSnapshot()
      return sourceDirty(state) || state.pending !== undefined
    }) })
  }

  mounted(section: string, block: string): void {
    const store = this.view(section, block)
    const view = store.getSnapshot()
    if (view.mode === 'source' && view.step === undefined) {
      const step = this.#step(section, block)
      if (step !== undefined) {
        store.set({ ...view, step })
        this.#persist()
        // A newly created block may mount after the creation acknowledgement or
        // after a code-triggered reload. Once its IR scope is known, select it.
        this.#applyStep(section, block)
      }
    }
    const key = keyOf(section, block)
    if (view.mode === 'preview' && this.#active === key && this.#restored.has(key)) {
      cancelAnimationFrame(this.#restoreFrame)
      this.#restoreFrame = requestAnimationFrame(() => {
        this.#restored.delete(key)
        if (this.#disposed || this.#active !== key || store.getSnapshot().mode !== 'preview') return
        this.#applyStep(section, block)
        store.set({ ...store.getSnapshot(), restore: undefined })
        this.#persist()
      })
    }
    this.announce()
  }

  #applyStep(section: string, block: string): void {
    if (this.#active !== keyOf(section, block)) return
    const store = this.view(section, block)
    const step = this.#step(section, block, store.getSnapshot().step)
    if (step === undefined) return
    if (step !== store.getSnapshot().step) store.set({ ...store.getSnapshot(), step })
    this.#viewer.show({ section, step })
    reportPreview({ type: 'narrate', section, step, navigate: false })
  }

  #entry(section: string, block: string, part: SourcePart): Entry {
    const key = entryKey(section, block, part)
    let entry = this.#entries.get(key)
    if (!entry) {
      entry = { section, block, part, state: createStore<SourceState>({ status: 'idle', verified: false }) }
      this.#entries.set(key, entry)
    }
    return entry
  }

  #set(entry: Entry, state: SourceState): void {
    if (this.#disposed) return
    entry.state.set(state)
    if (!this.#persist() && (sourceDirty(state) || state.pending))
      entry.state.set({ ...state, status: 'failed', error: 'source-storage' })
  }

  #mode(section: string, block: string, mode: SourceView['mode'], part?: SourcePart, step?: number): void {
    if (this.#disposed) return
    const view = this.view(section, block, part)
    const current = view.getSnapshot()
    view.set({ ...current, mode, part: part ?? current.part, step: step ?? this.#step(section, block, current.step), applying: undefined, restore: mode === 'preview' && this.#active === keyOf(section, block) ? true : undefined })
    this.#persist()
    if (mode === 'preview') this.#applyStep(section, block)
  }

  async showSource(section: string, block: string, part: SourcePart): Promise<void> {
    this.focus(section, block)
    const view = this.view(section, block, part).getSnapshot()
    const position = this.#viewer.position.getSnapshot()
    const step = view.mode === 'source' && view.step !== undefined ? view.step : this.#step(section, block, position.section === section ? position.step : undefined)
    this.#mode(section, block, 'source', part, step)
    await this.read(section, block, part, true)
  }

  async showPreview(section: string, block: string, part: SourcePart): Promise<void> {
    this.focus(section, block)
    // Configuration is in the document; code can reload the whole frame once it builds.
    // Commit configuration first so applying a block never leaves one part behind.
    const view = this.view(section, block, part)
    view.set({ ...view.getSnapshot(), applying: true })
    this.#persist()
    try {
      for (const selected of ['block', 'definition'] as const) {
        if (sourceDirty(this.state(section, block, selected).getSnapshot()))
          await this.save(section, block, selected)
      }
      const remaining = this.#dirtyPart(section, block)
      this.#mode(section, block, remaining ? 'source' : 'preview', remaining ?? part)
    } catch (error) {
      this.#mode(section, block, 'source', this.#dirtyPart(section, block) ?? part)
      throw error
    }
  }

  #dirtyPart(section: string, block: string): SourcePart | undefined {
    return (['block', 'definition'] as const).find(part => sourceDirty(this.state(section, block, part).getSnapshot()))
  }

  fail(section: string, block: string, part: SourcePart, error: unknown): void {
    const entry = this.#entry(section, block, part)
    this.#set(entry, { ...entry.state.getSnapshot(), status: 'failed', error: errorOf(error) })
  }

  edit(section: string, block: string, part: SourcePart, content: string): void {
    const entry = this.#entry(section, block, part)
    const before = entry.state.getSnapshot()
    this.#set(entry, {
      ...before,
      draft: content,
      status: before.status === 'saving' ? 'saving' : before.error === 'source-conflict' ? 'failed' : 'ready',
      error: before.error === 'source-conflict' ? before.error : undefined,
    })
  }

  async reload(section: string, block: string, part: SourcePart): Promise<void> {
    const entry = this.#entry(section, block, part)
    if (this.#saves.has(entryKey(section, block, part))) return
    this.#mode(section, block, 'source', part)
    this.#set(entry, { status: 'idle', verified: false })
    await this.read(section, block, part, true)
  }

  read(section: string, block: string, part: SourcePart, force = false): Promise<PreviewSource> {
    this.mounted(section, block)
    const key = entryKey(section, block, part)
    const pending = this.#reads.get(key)
    if (pending) return pending
    const entry = this.#entry(section, block, part)
    const before = entry.state.getSnapshot()
    if (!force && before.verified && before.source) return Promise.resolve(before.source)
    this.#set(entry, { ...before, status: before.status === 'saving' ? 'saving' : 'loading', error: undefined })
    const work = (async () => {
      try {
        const answer = await this.#request('source-result', section, block, request => {
          reportPreview({ type: 'source-read', section, block, part, request })
        })
        if (answer.type !== 'source-result' || !answer.source) throw new Error('source-unavailable')
        const source = answer.source
        const current = entry.state.getSnapshot()
        const committed = (current.pending?.content === source.content || current.draft === source.content) && current.source?.path === source.path
        const changed = current.source && (current.source.path !== source.path || current.source.content !== source.content)
        if (sourceDirty(current) && changed && !committed) {
          this.#set(entry, { ...current, status: 'failed', error: 'source-conflict', verified: true })
          throw new Error('source-conflict')
        }
        // A newer edit can return to the old baseline while a different version is
        // being saved. After a code-triggered reload it is still an unsaved edit,
        // even though it compared equal to that old baseline before the reload.
        const draft = sourceDirty(current) || current.pending ? current.draft : source.content
        this.#set(entry, { source, draft, status: current.status === 'saving' ? 'saving' : 'ready', verified: true })
        if (!this.#dirtyPart(section, block) && (this.view(section, block, part).getSnapshot().applying || (committed && current.pending?.preview))) this.#mode(section, block, 'preview', part)
        return source
      } catch (error) {
        this.#set(entry, { ...entry.state.getSnapshot(), status: 'failed', error: errorOf(error) })
        throw error
      }
    })()
    this.#reads.set(key, work)
    void work.finally(() => this.#reads.delete(key)).catch(() => {})
    return work
  }

  save(section: string, block: string, part: SourcePart, preview = false): Promise<void> {
    const key = entryKey(section, block, part)
    const pending = this.#saves.get(key)
    if (pending) return pending
    const entry = this.#entry(section, block, part)
    const initial = entry.state.getSnapshot()
    const content = initial.draft ?? initial.source?.content
    if (content === undefined) return Promise.reject(new Error('source-unavailable'))
    if (initial.error === 'source-conflict') return Promise.reject(new Error(initial.error))
    const work = this.#serial.then(async () => {
      try {
        this.#set(entry, { ...entry.state.getSnapshot(), status: 'saving', error: undefined })
        if (initial.source) await validateSource(initial.source.language, content)
        await bodySaveQueue(this.#viewer).settled()
        const source = await this.read(section, block, part, true)
        if (content === source.content) {
          this.#set(entry, { ...entry.state.getSnapshot(), status: 'ready', error: undefined })
          if (preview && !sourceDirty(entry.state.getSnapshot())) this.#mode(section, block, 'preview', part)
          return
        }
        this.#set(entry, { ...entry.state.getSnapshot(), status: 'saving', pending: { content, preview } })
        if (!this.#persist()) throw new Error('source-storage')
        const answer = await this.#request('source-saved', section, block, request => {
          console.debug('[presmium.source] source-save phase=post', { section, block, part, request })
          reportPreview({ type: 'source-save', section, block, part, request, path: source.path, base: source.version, content })
        })
        if (answer.type !== 'source-saved' || !answer.sourceVersion) throw new Error('source-unavailable')
        console.debug('[presmium.source] source-save phase=received', { section, block, part })
        const current = entry.state.getSnapshot()
        this.#set(entry, {
          source: { ...source, content, version: answer.sourceVersion },
          draft: current.draft,
          status: 'ready',
          verified: true,
        })
        if (preview && !sourceDirty(entry.state.getSnapshot())) this.#mode(section, block, 'preview', part)
      } catch (error) {
        console.debug('[presmium.source] source-save phase=failed', { section, block, part, error: errorOf(error) })
        this.#set(entry, { ...entry.state.getSnapshot(), status: 'failed', error: errorOf(error) })
        this.#mode(section, block, 'source', part)
        throw error
      }
    })
    this.#serial = work.catch(() => {})
    this.#saves.set(key, work)
    void work.finally(() => this.#saves.delete(key)).catch(() => {})
    return work
  }

  async create(section: string, after?: string): Promise<string> {
    const body = bodySaveQueue(this.#viewer)
    await body.settled()
    if (!this.#persist() && [...this.#entries.values()].some(entry => sourceDirty(entry.state.getSnapshot()))) throw new Error('source-storage')
    const revision = body.revision
    // Adding a scene module can reload this frame before the creation reply.
    // Persist its exact IR identity first so the new frame opens that block's
    // editor even when the old request never receives its acknowledgement.
    const id = `scene-${crypto.randomUUID()}`
    this.focus(section, id)
    this.#mode(section, id, 'source', 'definition')
    if (!this.#persist()) throw new Error('source-storage')
    const answer = await this.#request('source-created', section, undefined, request => {
      reportPreview({ type: 'source-create', section, id, request, revision, ...(after ? { after } : {}) })
    })
    if (answer.type !== 'source-created' || answer.block !== id) throw new Error('source-unavailable')
    this.focus(section, answer.block)
    this.#mode(section, answer.block, 'source', 'definition')
    this.#applyStep(section, answer.block)
    return answer.block
  }

  #request(type: SourceAnswer['type'], section: string, block: string | undefined, send: (request: number) => void): Promise<SourceAnswer> {
    if (this.#disposed) return Promise.reject(new Error('source-unavailable'))
    const request = ++nextRequest
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#requests.delete(request)
        reject(new Error('source-timeout'))
      }, 30_000)
      this.#requests.set(request, { type, section, block, resolve, reject, timeout })
      send(request)
    })
  }

  #answer = (event: Event): void => {
    const answer = (event as CustomEvent<SourceAnswer>).detail
    if (!answer || typeof answer.request !== 'number') return
    const pending = this.#requests.get(answer.request)
    if (!pending || pending.type !== answer.type || pending.section !== answer.section || (pending.block !== undefined && ('block' in answer ? answer.block : undefined) !== pending.block)) return
    clearTimeout(pending.timeout)
    this.#requests.delete(answer.request)
    if (answer.error) pending.reject(new Error(answer.error))
    else pending.resolve(answer)
  }

  #restore(): void {
    try {
      const stored = JSON.parse(sessionStorage.getItem(this.#storage) ?? 'null') as StoredSession | null
      if (!stored) return
      this.#active = typeof stored.active === 'string' ? stored.active : undefined
      for (const [key, view] of Object.entries(stored.views ?? {}))
        if ((view.mode === 'preview' || view.mode === 'source') && (view.part === 'definition' || view.part === 'block')) {
          const ids = JSON.parse(key) as unknown
          if (!Array.isArray(ids) || ids.length !== 2 || ids.some(id => typeof id !== 'string')) continue
          const restored: SourceView = { ...view, step: Number.isInteger(view.step) && view.step! >= 0 ? view.step : undefined, restore: key === this.#active && view.restore === true ? true : undefined }
          this.#views.set(key, createStore<SourceView>(restored))
          if (restored.restore) this.#restored.add(key)
        }
      for (const value of Object.values(stored.entries ?? {})) {
        if (typeof value.section !== 'string' || typeof value.block !== 'string' || (value.part !== 'definition' && value.part !== 'block')) continue
        if (value.source && (typeof value.source.path !== 'string' || typeof value.source.content !== 'string' || typeof value.source.language !== 'string' || typeof value.source.version !== 'string' || typeof value.source.shared !== 'number' || (value.source.part !== 'definition' && value.source.part !== 'block'))) continue
        if (value.draft !== undefined && typeof value.draft !== 'string') continue
        if (value.pending && (typeof value.pending.content !== 'string' || typeof value.pending.preview !== 'boolean')) continue
        const entry = this.#entry(value.section, value.block, value.part)
        entry.state.set({ source: value.source, draft: value.draft, pending: value.pending, status: 'idle', verified: false })
      }
    } catch {}
  }

  #persist(): boolean {
    if (this.#disposed) return false
    this.#announce()
    try {
      const stored: StoredSession = { active: this.#active, views: Object.fromEntries([...this.#views].map(([key, view]) => [key, view.getSnapshot()])), entries: {} }
      for (const [key, entry] of this.#entries) {
        const state = entry.state.getSnapshot()
        if (!sourceDirty(state) && !state.pending) continue
        stored.entries[key] = { section: entry.section, block: entry.block, part: entry.part, source: state.source, draft: state.draft, pending: state.pending }
      }
      sessionStorage.setItem(this.#storage, JSON.stringify(stored))
      return true
    } catch { return false }
  }

  #pagehide = (event: PageTransitionEvent): void => {
    if (event.persisted) return
    this.#persist()
    this.#disposed = true
    this.#unsubscribe()
    this.#unfollow()
    cancelAnimationFrame(this.#refresh)
    cancelAnimationFrame(this.#announceFrame)
    cancelAnimationFrame(this.#restoreFrame)
    window.removeEventListener('presmium:source-result', this.#answer)
    window.removeEventListener('presmium:source-saved', this.#answer)
    window.removeEventListener('presmium:source-created', this.#answer)
    window.removeEventListener('pagehide', this.#pagehide)
    for (const pending of this.#requests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('source-unavailable'))
    }
    this.#requests.clear()
    sessions.delete(this.#viewer)
  }
}
