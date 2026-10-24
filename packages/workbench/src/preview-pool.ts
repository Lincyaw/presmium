import type { Finding, PreviewRenderer, PreviewReport } from '@lincyaw/kernel'
import { connectPreview } from './preview.ts'
import type { PreviewConnection } from './preview.ts'
import type { Workbench } from './workbench.ts'

// Retain loaded modules, not running documents. Unsupported previews are removed.
const LIMIT = 2
const IDLE_MS = 120_000
const ACTIVITY_MS = 1500
const READY_MS = 45_000
// A page loaded out of sight is removed this long after its load, its lazy modules and styles fetched; or at the latest.
const PRELOAD_SETTLE_MS = 2000
const PRELOAD_MAX_MS = 30_000

export interface PreviewTarget {
  document: string
  renderer: PreviewRenderer
  address?: string
  title: string
  reload: number
}

/** The state of the selected preview's iframe. */
export interface PreviewFrameStatus {
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
  irRevision?: string
  problems: Map<string, Finding>
  detach?: () => void
  loading?: ReturnType<typeof setInterval>
  expiry?: ReturnType<typeof setTimeout>
  pending?: { request: number, active: boolean, timer: ReturnType<typeof setTimeout>, resolve(): void, reject(error: Error): void }
}

/**
 * Keeps the iframes of the last previews (at most two) in `container`, shows the selected one and pauses the others
 * (or removes those that cannot pause). `switchDocument` opens another document when a preview navigates to it.
 */
export function createPreviewPool(container: HTMLElement, workbench: Workbench, onStatus: (status: PreviewFrameStatus) => void, switchDocument: (document: string) => void) {
  const entries = new Map<string, Entry>()
  let desired: PreviewTarget | undefined
  let signature = ''
  let generation = 0
  let serial = Promise.resolve()
  let requests = 0
  let uses = 0
  let disposed = false
  let preloading: HTMLIFrameElement | undefined
  const keyOf = (target: PreviewTarget) => JSON.stringify([target.document, target.renderer])
  const selected = (entry: Entry) => !disposed && desired !== undefined && keyOf(desired) === entry.key
    && workbench.state.document === entry.target.document && workbench.state.previewRenderer === entry.target.renderer

  const publishRuntimeFindings = (entry: Entry, clear = false) => {
    if (!entry.irRevision) return
    void workbench.reportPreviewDiagnostics({ document: entry.target.document, renderer: entry.target.renderer, instance: entry.connection.nonce,
      revision: entry.irRevision, findings: clear ? [] : [...entry.problems.values()] })
  }

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
    publishRuntimeFindings(entry)
  }
  const show = (entry: Entry, irRevision?: string) => {
    if (!selected(entry)) return
    if (!entry.frame.hidden && entry.frame.dataset.active === 'true' && (irRevision === undefined || irRevision === entry.irRevision)) return
    clearTimeout(entry.expiry)
    entry.used = ++uses
    entry.frame.hidden = false
    entry.frame.style.display = ''
    entry.frame.className = 'pmw-preview__frame'
    entry.frame.dataset.active = 'true'
    entry.frame.tabIndex = 0
    entry.detach ??= workbench.attachPreview(entry.connection)
    if (irRevision !== undefined) entry.irRevision = irRevision
    onStatus({ ready: true })
    workbench.handlePreviewReport(entry.target.document, entry.target.renderer, { type: 'updated', revision: entry.irRevision })
    publishRuntimeFindings(entry)
  }
  /** Asks the page to run (`active`) or to pause its runtime; settles with its `activity` report. */
  const requestActivity = (entry: Entry, active: boolean): Promise<void> => new Promise((resolve, reject) => {
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
      publishRuntimeFindings(entry, true)
      try {
        await requestActivity(entry, false)
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

  const handleActivity = (entry: Entry, report: Extract<PreviewReport, { type: 'activity' }>) => {
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
  }

  const handleReady = (entry: Entry, report: Extract<PreviewReport, { type: 'ready' }>) => {
    const { target } = entry
    if (report.document !== target.document || report.renderer !== target.renderer) {
      const current = selected(entry)
      const navigated = current && report.renderer === target.renderer && workbench.state.documents?.documents.some(doc => doc.dir === report.document)
      destroy(entry)
      if (navigated) switchDocument(report.document)
      else if (current) onStatus({ ready: false, identityFailure: true })
      return
    }
    const reloaded = entry.ready
    entry.ready = true
    if (!reloaded) entry.active = true
    entry.irRevision = report.revision
    entry.problems.clear()
    publishRuntimeFindings(entry, true)
    clearInterval(entry.loading)
    if (!selected(entry)) enqueue(() => pause(entry))
    else if (!entry.pending && entry.active) {
      show(entry, report.revision)
      workbench.handlePreviewReport(target.document, target.renderer, report)
    } else if (!entry.pending) {
      enqueue(async () => {
        if (!selected(entry)) return
        try { await requestActivity(entry, true) } catch { destroy(entry) }
      })
    }
  }

  const handleReport = (entry: Entry, report: PreviewReport) => {
    if (entries.get(entry.key) !== entry) return
    if (report.type === 'activity') return handleActivity(entry, report)
    if (report.type === 'ready') return handleReady(entry, report)
    if (report.type === 'updated') entry.irRevision = report.revision
    if (report.type === 'report') {
      const key = JSON.stringify([report.level, report.plugin, report.message])
      if (report.resolved) entry.problems.delete(key)
      else entry.problems.set(key, { checkId: report.plugin ?? 'presmium.runtime', severity: report.level, message: report.message })
    }
    if (entry.active && (report.type === 'updated' || report.type === 'report')) publishRuntimeFindings(entry)
    if (entry.active && selected(entry)) workbench.handlePreviewReport(entry.target.document, entry.target.renderer, report)
  }

  const create = (target: PreviewTarget & { address: string }): Entry => {
    const frame = document.createElement('iframe')
    frame.title = target.title
    frame.dataset.document = target.document
    frame.dataset.renderer = target.renderer
    frame.dataset.previewCache = ''
    const key = keyOf(target)
    const connection = connectPreview(() => frame, target.address, {
      report: report => handleReport(entry, report),
      mismatch() {
        if (selected(entry)) onStatus({ ready: false, mismatch: true })
        destroy(entry)
      },
    }, { dark: workbench.state.isDark })
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
      onStatus({ ready: false })
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
            if (!wanted.active) await requestActivity(wanted, true)
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
    /**
     * Loads the page at `address` once out of sight, as Slidev's own embedding, then removes it: when it is shown, its
     * modules, styles and the dev server's work are in the caches. One at a time.
     */
    preload(address: string) {
      if (disposed || preloading) return
      const frame = document.createElement('iframe')
      const url = new URL(address, location.href)
      url.searchParams.set('embedded', 'true')
      frame.className = 'pmw-preview__preload'
      frame.setAttribute('aria-hidden', 'true')
      frame.tabIndex = -1
      const done = () => {
        clearTimeout(timer)
        frame.remove()
        if (preloading === frame) preloading = undefined
      }
      const timer = setTimeout(done, PRELOAD_MAX_MS)
      frame.addEventListener('load', () => setTimeout(done, PRELOAD_SETTLE_MS), { once: true })
      frame.src = url.href
      preloading = frame
      container.append(frame)
    },
    dispose() {
      disposed = true
      generation++
      preloading?.remove()
      preloading = undefined
      for (const entry of [...entries.values()]) destroy(entry)
    },
  }
}
