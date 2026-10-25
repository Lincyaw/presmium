import { createStore } from '@lincyaw/host'
import { PREVIEW_REVISION, reportPreview } from '@lincyaw/kernel'
import type {
  IRSection,
  PreviewCommand,
  PreviewEditedBlock,
} from '@lincyaw/kernel'
import type { Viewer } from '../viewer-state.ts'
import { isLegacyNarration } from '../../domain/document-content.ts'

export interface BodySaveState {
  status: 'saved' | 'dirty' | 'saving' | 'failed'
  error?: string
  blocks?: PreviewEditedBlock[]
  version: number
  restored?: boolean
}
interface StoredDraft {
  baseline: string
  blocks: PreviewEditedBlock[]
  error?: string
}
const queues = new WeakMap<Viewer, BodySaveQueue>()
let nextRequest = 0
const draftStorage = (viewer: Viewer) => `presmium.body-drafts:${location.pathname}:${viewer.doc.getSnapshot().meta.entry}`
// Source and mdast positions may move when an earlier section is saved.
function contentSignature(section: IRSection | undefined): string {
  return JSON.stringify(
    section && {
      title: section.title,
      config: section.config,
      hints: section.hints,
      steps: section.steps,
      blocks: section.blocks,
    },
    (key, value) =>
      key === 'source' || key === 'position' ? undefined : value,
  )
}
export function bodySaveQueue(viewer: Viewer): BodySaveQueue {
  let queue = queues.get(viewer)
  if (!queue) {
    queue = new BodySaveQueue(viewer)
    queues.set(viewer, queue)
  }
  return queue
}

/** Recover stored author drafts even when the lazy editor has not mounted yet. */
export async function settleBodyEdits(viewer: Viewer): Promise<void> {
  let queue = queues.get(viewer)
  if (!queue && document.documentElement.hasAttribute('data-preview-picking')) {
    try {
      if (sessionStorage.getItem(draftStorage(viewer))) queue = bodySaveQueue(viewer)
    } catch { throw new Error('draft-storage') }
  }
  await queue?.settled()
}

/** One document writes serially. Its acknowledgements and frozen drafts outlive any editor view. */
export class BodySaveQueue {
  readonly state = createStore<Record<string, BodySaveState>>({})
  #revision: string
  #version = 0
  #baselines = new Map<string, string>()
  #ownRevisions = new Map<string, string>()
  #flight?: { section: string; request: number; version: number }
  #held = new Set<string>()
  #settlers = new Set<() => void>()
  #timeout?: ReturnType<typeof setTimeout>
  #viewer: Viewer
  #storage: string
  #unsubscribe: () => void
  constructor(viewer: Viewer) {
    this.#viewer = viewer
    this.#storage = draftStorage(viewer)
    this.#revision = String(
      viewer.doc.getSnapshot().meta[PREVIEW_REVISION] ?? '',
    )
    this.#restore()
    this.#unsubscribe = viewer.doc.subscribe(() => {
      const revision = String(
        viewer.doc.getSnapshot().meta[PREVIEW_REVISION] ?? '',
      )
      const ownSection = this.#ownRevisions.get(revision)
      for (const [id, state] of Object.entries(this.state.getSnapshot())) {
        if (!state.blocks) continue
        const signature = contentSignature(viewer.section(id))
        if (id === this.#flight?.section || id === ownSection)
          this.#baselines.set(id, signature)
        else if (this.#baselines.get(id) !== signature)
          this.fail(id, 'revision-conflict')
      }
      this.#ownRevisions.delete(revision)
      if (this.#flight || revision === this.#revision) return
      this.#revision = revision
      // Changes to another page can move source positions without invalidating
      // this page's draft. Only the baseline comparison above marks conflicts.
      this.#persist()
    })
    window.addEventListener('presmium:blocks-result', this.#result)
    window.addEventListener('pagehide', this.#pagehide)
  }
  #pagehide = (event: PageTransitionEvent): void => {
    this.#persist()
    if (!event.persisted) this.dispose()
  }
  dispose(): void {
    this.#unsubscribe()
    clearTimeout(this.#timeout)
    window.removeEventListener('presmium:blocks-result', this.#result)
    window.removeEventListener('pagehide', this.#pagehide)
    queues.delete(this.#viewer)
  }
  draft(section: string): PreviewEditedBlock[] | undefined {
    return this.state.getSnapshot()[section]?.blocks
  }
  /** The latest source version acknowledged by the workbench, even before its IR event arrives. */
  get revision(): string { return this.#revision }
  announce(): void {
    reportPreview({ type: 'body-draft', dirty: Object.values(this.state.getSnapshot()).some(state => Boolean(state.blocks)) })
  }
  /** IME composition must not be submitted by another page's save callback. */
  hold(section: string, held: boolean): void {
    if (held) this.#held.add(section)
    else if (this.#held.delete(section)) {
      // compositionend records its final transaction in the same event. Check
      // afterwards so releasing a hold cannot acknowledge that text too early.
      queueMicrotask(() => { for (const check of [...this.#settlers]) check() })
    }
  }
  /** Code changes can reload the iframe, so finish body edits before applying them. */
  settled(): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {}
      let finished = false
      const done = (error?: string) => {
        if (finished) return
        finished = true
        unsubscribe()
        this.#settlers.delete(check)
        clearTimeout(timeout)
        if (error) reject(new Error(error))
        else resolve()
      }
      const check = () => {
        const states = Object.values(this.state.getSnapshot())
        const failed = states.find(state => state.status === 'failed')
        if (failed) return done(failed.error ?? 'save-failed')
        if (!this.#flight && !this.#held.size && !states.some(state => state.blocks)) return done()
        this.flush()
      }
      const timeout = setTimeout(() => done('save-timeout'), 30_000)
      unsubscribe = this.state.subscribe(check)
      this.#settlers.add(check)
      check()
    })
  }
  record(section: string, blocks: PreviewEditedBlock[]): void {
    const before = this.state.getSnapshot()[section]
    if (!before?.blocks)
      this.#baselines.set(
        section,
        contentSignature(this.#viewer.section(section)),
      )
    const frozen = blocks.map((block) => ({
      ...block,
      ...(block.durations ? { durations: [...block.durations] } : {}),
    }))
    this.#set(section, {
      version: ++this.#version,
      blocks: frozen,
      status: before?.error ? 'failed' : 'dirty',
      error: before?.error,
    })
  }
  fail(section: string, error: string): void {
    const state = this.state.getSnapshot()[section]
    this.#set(section, {
      ...state,
      version: state?.version ?? ++this.#version,
      status: 'failed',
      error,
    })
  }
  discard(section: string): void {
    if (this.#flight?.section === section) return
    this.#revision = String(
      this.#viewer.doc.getSnapshot().meta[PREVIEW_REVISION] ?? this.#revision,
    )
    this.#baselines.delete(section)
    this.#set(section, { version: ++this.#version, status: 'saved' })
  }
  retry(section: string): void {
    const state = this.state.getSnapshot()[section]
    if (!state?.blocks || this.#flight?.section === section) return
    if (this.#baselines.get(section) !== contentSignature(this.#viewer.section(section))) {
      this.fail(section, 'revision-conflict')
      return
    }
    this.#set(section, { ...state, status: 'dirty', error: undefined })
    this.flush()
  }
  flush(): void {
    if (this.#flight) return
    const next = Object.entries(this.state.getSnapshot()).find(
      ([section, state]) => !this.#held.has(section) && state.status === 'dirty' && state.blocks,
    )
    if (!next) return
    const [section, state] = next
    const request = ++nextRequest
    this.#flight = { section, request, version: state.version }
    this.#set(section, { ...state, status: 'saving' })
    this.#timeout = setTimeout(() => {
      if (this.#flight?.request !== request) return
      this.#flight = undefined
      this.fail(section, 'save-timeout')
    }, 30_000)
    reportPreview({
      type: 'blocks-edited',
      section,
      request,
      revision: this.#revision,
      blocks: state.blocks!.filter(block => {
        const original = this.#viewer.section(section)?.blocks.find(candidate => candidate.id === (block.source ?? block.id))
        return !original || !isLegacyNarration(this.#viewer.doc.getSnapshot(), original)
      }),
    })
  }
  #set(section: string, state: BodySaveState): void {
    this.state.set((before) => ({ ...before, [section]: state }))
    this.#persist()
    this.announce()
  }
  #restore(): void {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(this.#storage) ?? 'null')
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return
      for (const [section, entry] of Object.entries(stored)) {
        if (!entry || typeof entry !== 'object' || typeof entry.baseline !== 'string' || !Array.isArray(entry.blocks)) continue
        if (!entry.blocks.every((block: unknown) => {
          if (!block || typeof block !== 'object') return false
          const value = block as PreviewEditedBlock
          return typeof value.id === 'string' &&
            (value.source === undefined || typeof value.source === 'string') &&
            (value.at === undefined || Number.isInteger(value.at) && value.at >= 0) &&
            (value.markdown === undefined || typeof value.markdown === 'string') &&
            (value.scene === undefined || typeof value.scene === 'string') &&
            (value.durations === undefined || Array.isArray(value.durations) && value.durations.every(duration => typeof duration === 'number' && Number.isFinite(duration) && duration >= 0))
        })) continue
        const baseline = entry.baseline
        const error = baseline === contentSignature(this.#viewer.section(section))
          ? typeof entry.error === 'string' ? entry.error : undefined
          : 'revision-conflict'
        this.#baselines.set(section, baseline)
        this.state.set(before => ({ ...before, [section]: {
          version: ++this.#version,
          status: error ? 'failed' : 'dirty',
          blocks: entry.blocks as PreviewEditedBlock[],
          error,
          restored: true,
        } }))
      }
    } catch { /* An unavailable browser store must not prevent opening the document. */ }
  }
  #persist(): void {
    try {
      const stored: Record<string, StoredDraft> = {}
      for (const [section, state] of Object.entries(this.state.getSnapshot())) {
        if (!state.blocks) continue
        stored[section] = { baseline: this.#baselines.get(section) ?? contentSignature(this.#viewer.section(section)), blocks: state.blocks, ...(state.error ? { error: state.error } : {}) }
      }
      if (Object.keys(stored).length) sessionStorage.setItem(this.#storage, JSON.stringify(stored))
      else sessionStorage.removeItem(this.#storage)
    } catch {
      // Keep the in-memory draft and surface the persistence failure to both
      // the author and the workbench diagnostics instead of claiming recovery.
      const states = this.state.getSnapshot()
      if (Object.values(states).some(state => state.blocks && state.error !== 'draft-storage')) {
        this.state.set(Object.fromEntries(Object.entries(states).map(([section, state]) => [section, state.blocks ? { ...state, status: 'failed' as const, error: 'draft-storage' } : state])))
        reportPreview({ type: 'report', level: 'error', message: 'Body drafts could not be stored in this browser.', plugin: 'presmium.viewer' })
      }
    }
  }
  #result = (event: Event): void => {
    const answer = (
      event as CustomEvent<Extract<PreviewCommand, { type: 'blocks-result' }>>
    ).detail
    const flight = this.#flight
    if (
      !flight ||
      answer.section !== flight.section ||
      answer.request !== flight.request
    )
      return
    clearTimeout(this.#timeout)
    this.#flight = undefined
    const state = this.state.getSnapshot()[flight.section]!
    if (answer.error) {
      this.fail(flight.section, answer.error)
      return
    }
    this.#revision = answer.revision ?? this.#revision
    if (
      answer.revision &&
      String(this.#viewer.doc.getSnapshot().meta[PREVIEW_REVISION] ?? '') !==
        answer.revision
    )
      this.#ownRevisions.set(answer.revision, flight.section)
    if (state.version === flight.version) this.#baselines.delete(flight.section)
    this.#set(
      flight.section,
      state.version === flight.version
        ? { version: state.version, status: 'saved' }
        : { ...state, status: 'dirty', error: undefined },
    )
    this.flush()
  }
}
