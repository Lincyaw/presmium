import { createStore } from '@lincyaw/host'
import { reportPreview } from '@lincyaw/kernel'
import type { PreviewCommand } from '@lincyaw/kernel'
import type { Viewer } from '../viewer-state.ts'
import { bodySaveQueue } from './save-queue.ts'

type InsertPage = Extract<PreviewCommand, { type: 'page-insert' }>
type PageCreated = Extract<PreviewCommand, { type: 'page-created' }>
interface PendingPage {
  section: string
  id: string
  page?: string
  resolve(page: string): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}
const coordinators = new WeakMap<Viewer, PageCreation>()
let nextRequest = 0
const errorOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function pageCreation(viewer: Viewer): PageCreation {
  let coordinator = coordinators.get(viewer)
  if (!coordinator) {
    coordinator = new PageCreation(viewer)
    coordinators.set(viewer, coordinator)
  }
  return coordinator
}

/** Navigation and the native block menu share one draft-safe page insertion flow. */
export class PageCreation {
  readonly busy = createStore(false)
  #viewer: Viewer
  #pending = new Map<number, PendingPage>()
  #editors = new Map<string, () => void>()
  #focus?: string
  #frame = 0
  #serial: Promise<unknown> = Promise.resolve()
  #queued = 0
  #disposed = false
  #unsubscribe: () => void

  constructor(viewer: Viewer) {
    this.#viewer = viewer
    // replace() restores its retained position after publishing doc; navigate after that restoration.
    this.#unsubscribe = viewer.doc.subscribe(() => queueMicrotask(() => this.#complete()))
    window.addEventListener('presmium:page-insert', this.#insert)
    window.addEventListener('presmium:page-created', this.#created)
    window.addEventListener('pagehide', this.#pagehide)
  }

  register(section: string, focus: () => void): () => void {
    this.#editors.set(section, focus)
    if (this.#focus === section) this.#focusEditor(section)
    return () => {
      if (this.#editors.get(section) === focus) this.#editors.delete(section)
    }
  }

  create(section: string, id = `page-${crypto.randomUUID()}`, request = ++nextRequest): Promise<string> {
    this.#queued++
    this.busy.set(true)
    const work = this.#serial.then(async () => {
      if (this.#disposed) throw new Error('page-unavailable')
      const queue = bodySaveQueue(this.#viewer)
      await queue.settled()
      if (this.#disposed) throw new Error('page-unavailable')
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.#pending.delete(request)
          reject(new Error('page-timeout'))
        }, 30_000)
        this.#pending.set(request, { section, id, resolve, reject, timeout })
        reportPreview({ type: 'page-create', section, id, request, revision: queue.revision })
      })
    }).catch(error => {
      if (!this.#disposed) reportPreview({ type: 'page-create-error', request, error: errorOf(error) })
      throw error
    }).finally(() => {
      if (--this.#queued === 0) this.busy.set(false)
    })
    this.#serial = work.catch(() => {})
    return work
  }

  #insert = (event: Event): void => {
    const command = (event as CustomEvent<InsertPage>).detail
    if (command?.type !== 'page-insert') return
    void this.create(command.section, command.id, command.request).catch(() => {})
  }

  #created = (event: Event): void => {
    const answer = (event as CustomEvent<PageCreated>).detail
    if (answer?.type !== 'page-created') return
    const pending = this.#pending.get(answer.request)
    if (!pending || answer.section !== pending.section) return
    if (answer.error || answer.page !== pending.id) {
      clearTimeout(pending.timeout)
      this.#pending.delete(answer.request)
      pending.reject(new Error(answer.error ?? 'page-unavailable'))
      return
    }
    pending.page = answer.page
    this.#complete()
  }

  #complete(): void {
    if (this.#disposed) return
    for (const [request, pending] of this.#pending) {
      if (!pending.page || !this.#viewer.section(pending.page)) continue
      clearTimeout(pending.timeout)
      this.#pending.delete(request)
      this.#focus = pending.page
      this.#viewer.show({ section: pending.page, step: 0 })
      reportPreview({ type: 'narrate', section: pending.page, step: 0, navigate: false })
      this.#focusEditor(pending.page)
      pending.resolve(pending.page)
    }
  }

  #focusEditor(section: string): void {
    cancelAnimationFrame(this.#frame)
    this.#frame = requestAnimationFrame(() => {
      if (this.#disposed || this.#focus !== section) return
      const focus = this.#editors.get(section)
      if (!focus) return
      this.#focus = undefined
      focus()
    })
  }

  #pagehide = (event: PageTransitionEvent): void => {
    if (event.persisted) return
    this.#disposed = true
    this.#unsubscribe()
    cancelAnimationFrame(this.#frame)
    window.removeEventListener('presmium:page-insert', this.#insert)
    window.removeEventListener('presmium:page-created', this.#created)
    window.removeEventListener('pagehide', this.#pagehide)
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('page-unavailable'))
    }
    this.#pending.clear()
    coordinators.delete(this.#viewer)
  }
}
