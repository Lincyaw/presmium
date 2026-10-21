import type { PreviewReport } from '@lincyaw/kernel'
import { connectPreview } from './preview.ts'
import type { PreviewConnection } from './preview.ts'
import type { PreviewView, Workbench } from './store.ts'

// Retain loaded modules, not running documents. Unsupported previews are removed.
const LIMIT = 2
const IDLE_MS = 120_000
const ACTIVITY_MS = 1500
const READY_MS = 45_000

export interface PreviewTarget {
  document: string
  view: PreviewView
  address?: string
  title: string
  reload: number
}

export interface PreviewState {
  ready: boolean
  mismatch?: boolean
  identityFailure?: boolean
}

interface Entry {
  key: string
  target: PreviewTarget & { address: string }
  frame: HTMLIFrameElement
  connection: PreviewConnection
  ready: boolean
  active: boolean
  used: number
  revision?: string
  problems: Map<string, Extract<PreviewReport, { type: 'report' }>>
  detach?: () => void
  loading?: ReturnType<typeof setInterval>
  expiry?: ReturnType<typeof setTimeout>
  pending?: { request: number, active: boolean, timer: ReturnType<typeof setTimeout>, resolve(): void, reject(error: Error): void }
}

export function createPreviewPool(container: HTMLElement, workbench: Workbench, changed: (state: PreviewState) => void, navigate: (document: string) => void) {
  const entries = new Map<string, Entry>()
  let desired: PreviewTarget | undefined
  let signature = ''
  let generation = 0
  let serial = Promise.resolve()
  let requests = 0
  let uses = 0
  let disposed = false
  const keyOf = (target: PreviewTarget) => JSON.stringify([target.document, target.view])
  const selected = (entry: Entry) => !disposed && desired !== undefined && keyOf(desired) === entry.key
    && workbench.state.document === entry.target.document && workbench.state.view === entry.target.view

  const hide = (entry: Entry) => {
    entry.detach?.()
    entry.detach = undefined
    entry.frame.hidden = true
    entry.frame.style.display = 'none'
    entry.frame.className = 'pmw-preview__cached-frame'
    entry.frame.dataset.active = 'false'
    entry.frame.tabIndex = -1
  }
  const destroy = (entry: Entry) => {
    if (entries.get(entry.key) !== entry) return
    entries.delete(entry.key)
    hide(entry)
    clearInterval(entry.loading)
    clearTimeout(entry.expiry)
    if (entry.pending) {
      clearTimeout(entry.pending.timer)
      entry.pending.reject(new Error('Preview removed'))
      entry.pending = undefined
    }
    entry.connection.dispose()
    entry.frame.remove()
    entry.problems.clear()
  }
  const show = (entry: Entry, revision?: string) => {
    if (!selected(entry)) return
    if (!entry.frame.hidden && entry.frame.dataset.active === 'true' && (revision === undefined || revision === entry.revision)) return
    clearTimeout(entry.expiry)
    entry.used = ++uses
    entry.frame.hidden = false
    entry.frame.style.display = ''
    entry.frame.className = 'pmw-preview__frame'
    entry.frame.dataset.active = 'true'
    entry.frame.tabIndex = 0
    entry.detach ??= workbench.attachPreview(entry.connection)
    if (revision !== undefined) entry.revision = revision
    changed({ ready: true })
    workbench.previewReport(entry.target.document, entry.target.view, { type: 'updated', revision: entry.revision })
    for (const problem of entry.problems.values()) workbench.previewReport(entry.target.document, entry.target.view, problem)
  }
  const activity = (entry: Entry, active: boolean): Promise<void> => new Promise((resolve, reject) => {
    const request = ++requests
    const timer = setTimeout(() => {
      entry.pending = undefined
      reject(new Error('Preview activity timed out'))
    }, ACTIVITY_MS)
    entry.pending = { request, active, timer, resolve, reject }
    entry.connection.send({ type: 'activity', active, request })
  })
  const pause = async (entry: Entry) => {
    hide(entry)
    if (!entry.ready || !entry.connection.capabilities.includes('activity')) return destroy(entry)
    if (entry.active) {
      try {
        await activity(entry, false)
      } catch {
        return destroy(entry)
      }
    }
    if (entries.get(entry.key) === entry) {
      clearTimeout(entry.expiry)
      entry.expiry = setTimeout(() => { if (!entry.active) destroy(entry) }, IDLE_MS)
    }
  }
  const enqueue = (work: () => Promise<void>) => {
    serial = serial.then(work).catch(() => {})
  }

  const create = (target: PreviewTarget & { address: string }): Entry => {
    const frame = document.createElement('iframe')
    frame.title = target.title
    frame.dataset.document = target.document
    frame.dataset.view = target.view
    frame.dataset.previewCache = ''
    const key = keyOf(target)
    const connection = connectPreview(() => frame, target.address, {
      report(report: PreviewReport) {
        if (entries.get(key) !== entry) return
        if (report.type === 'activity') {
          const pending = entry.pending
          if (!pending || pending.request !== report.request) return
          clearTimeout(pending.timer)
          entry.pending = undefined
          entry.active = report.active
          if (report.error || report.active !== pending.active) pending.reject(new Error(report.error ?? 'Preview activity failed'))
          else {
            if (report.active && selected(entry)) show(entry, report.revision)
            pending.resolve()
          }
          return
        }
        if (report.type === 'ready') {
          if (report.document !== target.document || report.renderer !== target.view) {
            const current = selected(entry)
            const follow = current && report.renderer === target.view && workbench.state.documents?.documents.some(doc => doc.dir === report.document)
            destroy(entry)
            if (follow) navigate(report.document)
            else if (current) changed({ ready: false, identityFailure: true })
            return
          }
          const reloaded = entry.ready
          entry.ready = true
          if (!reloaded) entry.active = true
          entry.revision = report.revision
          entry.problems.clear()
          clearInterval(entry.loading)
          if (selected(entry)) {
            if (!entry.pending && entry.active) {
              show(entry, report.revision)
              workbench.previewReport(target.document, target.view, report)
            } else if (!entry.pending) enqueue(async () => {
              if (!selected(entry)) return
              try { await activity(entry, true) } catch { destroy(entry) }
            })
          } else enqueue(() => pause(entry))
          return
        }
        if (report.type === 'updated') entry.revision = report.revision
        if (report.type === 'report') {
          const key = JSON.stringify([report.level, report.plugin, report.message])
          entry.problems.set(key, report)
        }
        if (entry.active && selected(entry)) {
          workbench.previewReport(target.document, target.view, report)
        }
      },
      mismatch() {
        if (selected(entry)) changed({ ready: false, mismatch: true })
        destroy(entry)
      },
    })
    const entry: Entry = { key, target, frame, connection, ready: false, active: true, used: ++uses, problems: new Map() }
    entries.set(key, entry)
    hide(entry)
    // Keep the selected loading frame discoverable without exposing another document.
    frame.className = 'pmw-preview__frame'
    frame.src = connection.src
    container.append(frame)
    let retries = 0
    entry.loading = setInterval(() => {
      if (!selected(entry) || entry.ready || retries++ >= 3) return
      frame.src = connection.src
    }, READY_MS)
    return entry
  }

  return {
    select(target?: PreviewTarget) {
      if (disposed) return
      const key = target && keyOf(target)
      const known = key && entries.get(key)
      const address = target?.address ?? (known ? known.target.address : undefined)
      const next = target ? JSON.stringify([key, address, target.reload]) : ''
      const reload = target !== undefined && desired !== undefined && key === keyOf(desired) && target.reload !== desired.reload
      desired = target
      if (signature === next) return
      signature = next
      const own = ++generation
      changed({ ready: false })
      for (const entry of entries.values()) hide(entry)
      enqueue(async () => {
        if (own !== generation || disposed) return
        let wanted = key ? entries.get(key) : undefined
        if (wanted && (reload || (address && wanted.target.address !== address))) {
          destroy(wanted)
          wanted = undefined
        }
        // Reserve the selected shell before waiting for another runtime to stop.
        // Its idle timer must not remove it during that asynchronous pause.
        if (wanted) clearTimeout(wanted.expiry)
        for (const entry of [...entries.values()]) if (entry !== wanted) await pause(entry)
        if (own !== generation || disposed || !target) return
        if (wanted && entries.get(wanted.key) !== wanted) wanted = undefined
        if (wanted?.ready) {
          wanted.frame.title = target.title
          clearTimeout(wanted.expiry)
          try {
            if (!wanted.active) await activity(wanted, true)
            if (own === generation) show(wanted)
            return
          } catch {
            destroy(wanted)
          }
        } else if (wanted) return
        if (!address || own !== generation) return
        while (entries.size >= LIMIT) destroy([...entries.values()].sort((a, b) => a.used - b.used)[0]!)
        create({ ...target, address })
      })
    },
    dispose() {
      disposed = true
      generation++
      for (const entry of [...entries.values()]) destroy(entry)
    },
  }
}
