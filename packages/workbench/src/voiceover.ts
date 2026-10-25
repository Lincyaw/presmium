import { errorMessage } from '@lincyaw/kernel'
import type { VoiceoverJob, VoiceoverRequest, VoiceoverSnapshot } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

const active = (job: VoiceoverJob) => job.state === 'queued' || job.state === 'running' || job.state === 'cancelling'
function newer(known: VoiceoverJob | undefined, incoming: VoiceoverJob): VoiceoverJob {
  if (!known) return incoming
  if (!active(known) && active(incoming) || known.completed > incoming.completed || known.failed > incoming.failed
    || known.state === 'cancelling' && (incoming.state === 'queued' || incoming.state === 'running')) return known
  return incoming
}
const cacheSignature = (snapshot: VoiceoverSnapshot) => JSON.stringify({
  steps: snapshot.steps.map(step => [step.target.section, step.target.step, step.target.binding, step.state, step.cached, step.utterances]),
  unboundByPage: (snapshot.unboundByPage ?? []).map(page => [page.section, page.state, page.cached, page.utterances, page.reason]),
})

/** Exact-cache status and explicit speech jobs; these are separate from compilation and export jobs. */
export class DocumentVoiceover {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #onAudioChanged: (document: string, revision: string) => void | Promise<void>
  readonly #signatures = new Map<string, { revision: string, signature: string }>()
  readonly #answers = new Map<string, VoiceoverJob>()
  #document?: string
  #scope = 0
  #controller?: AbortController
  #timer?: ReturnType<typeof setTimeout>
  #reading?: { scope: number, work: Promise<void> }
  #refreshRequested = false
  #starting = false
  #cancelling?: string
  #capability?: { revision: string, available: boolean }

  constructor(client: WorkspaceClient, store: WorkbenchStore, onAudioChanged: (document: string, revision: string) => void | Promise<void>) {
    this.#client = client
    this.#store = store
    this.#onAudioChanged = onAudioChanged
  }

  subscribe(document: string): void {
    this.stop()
    this.#document = document
    this.#controller = new AbortController()
    void this.read()
  }

  #current(document: string, scope: number): boolean {
    return this.#document === document && this.#scope === scope && this.#store.state.document === document
  }

  #schedule(document: string, scope: number): void {
    if (!this.#current(document, scope)) return
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (this.#capability?.available !== false && (this.#store.state.voiceover?.jobs.some(active) || [...this.#answers.values()].some(active)))
      this.#timer = setTimeout(() => { this.#timer = undefined; void this.#read(false) }, 1000)
  }

  #merge(snapshot: VoiceoverSnapshot): VoiceoverSnapshot {
    const known = new Map((this.#store.state.voiceover?.jobs ?? []).map(job => [job.id, job]))
    for (const job of this.#answers.values()) known.set(job.id, newer(known.get(job.id), job))
    const jobs = snapshot.jobs.map(job => {
      const result = newer(known.get(job.id), job)
      if (result === job) this.#answers.delete(job.id)
      known.delete(job.id)
      return result
    })
    // A POST may finish after a GET took its snapshot. Keep that real answer until a newer read includes it.
    for (const job of known.values()) if (active(job) || this.#answers.has(job.id)) jobs.push(job)
    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { ...snapshot, jobs }
  }

  async #audioChanged(document: string, snapshot: VoiceoverSnapshot, scope: number): Promise<void> {
    const previous = this.#signatures.get(document)
    const signature = cacheSignature(snapshot)
    const revision = this.#store.state.ir?.revision
    if (revision !== undefined && revision !== snapshot.revision || previous && revision === undefined) return
    if (previous && previous.signature !== signature) await this.#onAudioChanged(document, snapshot.revision)
    if (!this.#current(document, scope) || this.#store.state.ir && this.#store.state.ir.revision !== snapshot.revision) return
    this.#signatures.delete(document)
    this.#signatures.set(document, { revision: snapshot.revision, signature })
    while (this.#signatures.size > 16) this.#signatures.delete(this.#signatures.keys().next().value!)
  }

  async #available(document: string, scope: number, refresh: boolean): Promise<boolean> {
    if (refresh || !this.#capability || this.#capability.revision !== this.#store.state.ir?.revision) {
      const settings = await this.#client.readVoiceSettings(document, undefined, undefined, this.#controller?.signal)
      if (!this.#current(document, scope)) return false
      this.#capability = { revision: settings.revision, available: settings.capabilities.voiceover }
    }
    const available = this.#capability.available
    if (!available) {
      this.#answers.clear()
      this.#store.set({ voiceover: undefined, voiceoverFailure: 'voiceover-unavailable' })
    }
    return available
  }

  read(): Promise<void> { return this.#read(true) }

  #read(refreshCapability: boolean): Promise<void> {
    const document = this.#document, scope = this.#scope
    if (document === undefined || !this.#current(document, scope)) return Promise.resolve()
    if (this.#reading?.scope === scope) {
      if (refreshCapability) this.#refreshRequested = true
      return this.#reading.work
    }
    clearTimeout(this.#timer)
    const pending = { scope, work: Promise.resolve() }
    const signal = this.#controller?.signal
    pending.work = (async () => {
      try {
        if (!await this.#available(document, scope, refreshCapability)) return
        const answer = await this.#client.readVoiceover(document, signal)
        if (!this.#current(document, scope)) return
        const snapshot = this.#merge(answer)
        this.#store.set({ voiceover: snapshot, voiceoverFailure: undefined })
        await this.#audioChanged(document, snapshot, scope)
      } catch (error) {
        if (this.#current(document, scope)) this.#store.set({ voiceoverFailure: errorMessage(error) })
      } finally {
        if (this.#reading === pending) this.#reading = undefined
        if (this.#current(document, scope) && this.#refreshRequested) {
          this.#refreshRequested = false
          void this.#read(true)
        } else this.#schedule(document, scope)
      }
    })()
    this.#reading = pending
    return pending.work
  }

  #remember(job: VoiceoverJob): void {
    this.#answers.set(job.id, newer(this.#answers.get(job.id), job))
    while (this.#answers.size > 32) {
      const removable = [...this.#answers.values()].find(job => !active(job))
      if (!removable) break
      this.#answers.delete(removable.id)
    }
    const snapshot = this.#store.state.voiceover
    if (snapshot) this.#store.set({ voiceover: this.#merge(snapshot) })
  }

  async #refreshAfterWrite(document: string, scope: number): Promise<void> {
    // An older in-flight GET cannot be the only refresh for an already completed POST.
    if (this.#reading?.scope === scope) await this.#reading.work
    if (this.#current(document, scope)) await this.read()
  }

  async start(request: VoiceoverRequest): Promise<void> {
    const document = this.#document, scope = this.#scope
    if (document === undefined || !this.#current(document, scope) || this.#starting) return
    this.#starting = true
    this.#store.set({ voiceoverStarting: true, voiceoverFailure: undefined })
    try {
      if (!await this.#available(document, scope, true)) return
      const job = await this.#client.startVoiceover(document, request, this.#controller?.signal)
      if (!this.#current(document, scope)) return
      this.#remember(job)
      await this.#refreshAfterWrite(document, scope)
    } catch (error) {
      if (this.#current(document, scope)) this.#store.set({ voiceoverFailure: errorMessage(error) })
    } finally {
      if (this.#current(document, scope)) {
        this.#starting = false
        this.#store.set({ voiceoverStarting: false })
        this.#schedule(document, scope)
      }
    }
  }

  async cancel(id: string): Promise<void> {
    const document = this.#document, scope = this.#scope
    if (document === undefined || !this.#current(document, scope) || this.#cancelling) return
    this.#cancelling = id
    this.#store.set({ voiceoverCancelPending: id, voiceoverFailure: undefined })
    try {
      if (!await this.#available(document, scope, true)) return
      const job = await this.#client.cancelVoiceover(document, id, this.#controller?.signal)
      if (!this.#current(document, scope)) return
      this.#remember(job)
      await this.#refreshAfterWrite(document, scope)
    } catch (error) {
      if (this.#current(document, scope)) this.#store.set({ voiceoverFailure: errorMessage(error) })
    } finally {
      if (this.#current(document, scope)) {
        this.#cancelling = undefined
        this.#store.set({ voiceoverCancelPending: undefined })
        this.#schedule(document, scope)
      }
    }
  }

  stop(): void {
    this.#scope++
    this.#controller?.abort()
    this.#controller = undefined
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#reading = undefined
    this.#refreshRequested = false
    this.#document = undefined
    this.#answers.clear()
    this.#starting = false
    this.#cancelling = undefined
    this.#capability = undefined
  }
}
