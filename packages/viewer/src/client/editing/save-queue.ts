import { createStore } from '@lincyaw/host'
import { PREVIEW_REVISION, reportPreview } from '@lincyaw/kernel'
import type {
  IRSection,
  PreviewCommand,
  PreviewEditedBlock,
} from '@lincyaw/kernel'
import type { Viewer } from '../viewer-state.ts'

export interface BodySaveState {
  status: 'saved' | 'dirty' | 'saving' | 'failed'
  error?: string
  blocks?: PreviewEditedBlock[]
  version: number
}
const queues = new WeakMap<Viewer, BodySaveQueue>()
let nextRequest = 0
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

/** One document writes serially. Its acknowledgements and frozen drafts outlive any editor view. */
export class BodySaveQueue {
  readonly state = createStore<Record<string, BodySaveState>>({})
  #revision: string
  #version = 0
  #baselines = new Map<string, string>()
  #ownRevisions = new Map<string, string>()
  #flight?: { section: string; request: number; version: number }
  #timeout?: ReturnType<typeof setTimeout>
  #viewer: Viewer
  #unsubscribe: () => void
  constructor(viewer: Viewer) {
    this.#viewer = viewer
    this.#revision = String(
      viewer.doc.getSnapshot().meta[PREVIEW_REVISION] ?? '',
    )
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
      const states = this.state.getSnapshot()
      this.state.set(
        Object.fromEntries(
          Object.entries(states).map(([id, state]) => [
            id,
            state.blocks
              ? { ...state, status: 'failed', error: 'revision-conflict' }
              : state,
          ]),
        ),
      )
    })
    window.addEventListener('presmium:blocks-result', this.#result)
    window.addEventListener('pagehide', this.#pagehide)
  }
  #pagehide = (event: PageTransitionEvent): void => {
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
  /** Code changes can reload the iframe, so finish body edits before applying them. */
  settled(): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {}
      const done = (error?: string) => {
        unsubscribe()
        clearTimeout(timeout)
        if (error) reject(new Error(error))
        else resolve()
      }
      const check = () => {
        const states = Object.values(this.state.getSnapshot())
        const failed = states.find(state => state.status === 'failed')
        if (failed) return done(failed.error ?? 'save-failed')
        if (!this.#flight && !states.some(state => state.blocks)) return done()
        this.flush()
      }
      const timeout = setTimeout(() => done('save-timeout'), 30_000)
      unsubscribe = this.state.subscribe(check)
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
  flush(): void {
    if (this.#flight) return
    const next = Object.entries(this.state.getSnapshot()).find(
      ([, state]) => state.status === 'dirty' && state.blocks,
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
      blocks: state.blocks!,
    })
  }
  #set(section: string, state: BodySaveState): void {
    this.state.set((before) => ({ ...before, [section]: state }))
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
