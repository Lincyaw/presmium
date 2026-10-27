import { Component, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { isObservedWorkspaceFailure, PmButton, PmNotice } from '@lincyaw/workbench'
import type { Workbench, WorkspaceRequestEvent } from '@lincyaw/workbench'
import type { AuthoringDiagnostics, CanonicalSource } from '@lincyaw/kernel'
import { createObservable } from './observable.ts'
import { useClientMessages } from './messages.ts'

interface RuntimeIssue {
  key: string
  document?: string
  checkId: string
  message: string
  feedbackOwner?: WorkspaceRequestEvent['feedbackOwner']
  authoringSource?: CanonicalSource
}
interface RuntimeSnapshot { issues: readonly RuntimeIssue[], reportFailed: boolean }
const instances = new WeakMap<Workbench, WorkbenchRuntimeDiagnostics>()
const LIMIT = 20

/** Diagnostics never include request payloads, stack traces or URL credentials. */
export function runtimeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : ''
  return (text || 'An unexpected workbench error occurred.')
    .replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, value => {
      try { const url = new URL(value); return `${url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin}${url.pathname}` } catch { return '[URL]' }
    })
    .replace(/["']?authorization["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, '[credential redacted]')
    .replace(/\bauthorization\s*[:=]\s*[^\r\n;,]+/gi, '[credential redacted]')
    .replace(/\b(?:bearer|basic)\s+[^\s"',;&]+/gi, '[credential redacted]')
    .replace(/["']?(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|token|password|secret)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi, '[credential redacted]')
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|token|password|secret)\b\s*[:=]\s*[^\s"',;&]+/gi, '[credential redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[credential redacted]')
    .slice(0, 600)
}
const aborted = (value: unknown) => value instanceof Error && value.name === 'AbortError'

/** Root-window failures stay separate from the authored iframe's diagnostic contribution. */
export class WorkbenchRuntimeDiagnostics {
  readonly state = createObservable<RuntimeSnapshot>({ issues: [], reportFailed: false })
  readonly #workbench: Workbench
  readonly #instance = `workbench:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
  readonly #seen = new WeakSet<object>()
  readonly #attempted = new Map<string, string>()
  readonly #requests = new Map<number, { document?: string, key: string, feedbackOwner?: WorkspaceRequestEvent['feedbackOwner'], authoringSource?: CanonicalSource }>()
  readonly #latestRequests = new Map<string, number>()
  #reports = Promise.resolve()
  #timer?: ReturnType<typeof setTimeout>
  #stop?: () => void
  #active = false
  #document?: string

  constructor(workbench: Workbench) { this.#workbench = workbench }

  start(): () => void {
    if (this.#stop) return this.#stop
    this.#active = true
    const error = (event: ErrorEvent | Event) => {
      if (event instanceof ErrorEvent) this.capture(event.error ?? event.message)
      else if (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement) {
        const source = event.target instanceof HTMLScriptElement ? event.target.src : event.target.href
        this.capture(`A workbench resource could not be loaded: ${source}`)
      }
    }
    const rejection = (event: PromiseRejectionEvent) => this.capture(event.reason)
    window.addEventListener('error', error, true)
    window.addEventListener('unhandledrejection', rejection)
    const unwatchRequests = this.#workbench.client.subscribeRequests?.(event => this.#request(event))
    const unwatchWorkbench = this.#workbench.subscribe(() => this.#schedule())
    this.#schedule()
    this.#stop = () => {
      this.#active = false
      clearTimeout(this.#timer)
      this.#timer = undefined
      window.removeEventListener('error', error, true)
      window.removeEventListener('unhandledrejection', rejection)
      unwatchRequests?.()
      unwatchWorkbench()
      this.#requests.clear()
      this.#latestRequests.clear()
      if (this.#document !== undefined) this.#send(this.#document, [])
      this.#stop = undefined
    }
    return this.#stop
  }

  capture(error: unknown): void {
    if (!this.#active || aborted(error) || isObservedWorkspaceFailure(error)) return
    if (typeof error === 'object' && error !== null) {
      if (this.#seen.has(error)) return
      this.#seen.add(error)
    }
    const document = this.#workbench.state.document
    const message = runtimeMessage(error)
    this.#add({ key: JSON.stringify(['error', document, message]), document, checkId: 'presmium.workbench.error', message, authoringSource: this.#source(document) })
  }

  #source(document: string | undefined): CanonicalSource | undefined {
    const value = this.#workbench.state.authoring
    if (document === undefined || value?.directory !== document || !value.content || !value.version || !value.fingerprint) return
    return { documentId: value.content.id, version: value.version, fingerprint: value.fingerprint }
  }

  #request(event: WorkspaceRequestEvent): void {
    if (event.kind === 'start') {
      const document = event.document === '' ? this.#workbench.state.document : event.document
      const key = JSON.stringify(['request', document, event.method, event.path, event.feedbackOwner])
      this.#requests.set(event.requestId, { document, key, feedbackOwner: event.feedbackOwner, authoringSource: this.#source(document) })
      this.#latestRequests.delete(key)
      this.#latestRequests.set(key, event.requestId)
      while (this.#requests.size > LIMIT * 8) this.#requests.delete(this.#requests.keys().next().value!)
      while (this.#latestRequests.size > LIMIT * 4) this.#latestRequests.delete(this.#latestRequests.keys().next().value!)
      return
    }
    const request = this.#requests.get(event.requestId)
    this.#requests.delete(event.requestId)
    if (!request || this.#latestRequests.get(request.key) !== event.requestId || event.kind === 'cancel') return
    const { document, key, feedbackOwner, authoringSource } = request
    if (event.kind === 'recovery') {
      const issues = this.state.getSnapshot().issues
      if (issues.some(issue => issue.key === key)) this.#replace(issues.filter(issue => issue.key !== key))
      return
    }
    const message = `${event.method} /api/presmium/${event.path}: ${event.status === undefined ? 'the workspace service could not be reached' : `HTTP ${event.status}`}`
    this.#add({ key, document, checkId: 'presmium.workbench.request', message, authoringSource, ...event.status !== undefined && feedbackOwner ? { feedbackOwner } : {} })
  }

  #add(issue: RuntimeIssue): void {
    const issues = this.state.getSnapshot().issues
    const known = issues.find(known => known.key === issue.key)
    if (known) {
      if (known.message !== issue.message || known.feedbackOwner !== issue.feedbackOwner || JSON.stringify(known.authoringSource) !== JSON.stringify(issue.authoringSource)) this.#replace(issues.map(value => value === known ? issue : value))
      return
    }
    this.#replace([...issues, issue].slice(-LIMIT))
  }
  #replace(issues: readonly RuntimeIssue[]): void {
    this.state.set({ ...this.state.getSnapshot(), issues })
    this.#schedule()
  }

  visible(): readonly RuntimeIssue[] {
    const { document } = this.#workbench.state
    return this.state.getSnapshot().issues.filter(issue => (issue.document === undefined || issue.document === document) && issue.feedbackOwner !== 'inline-preview')
  }

  dismiss(): void {
    const document = this.#workbench.state.document
    this.#replace(this.state.getSnapshot().issues.filter(issue => issue.document !== undefined && issue.document !== document))
  }
  retry(): void {
    const document = this.#workbench.state.document
    if (document !== undefined) this.#attempted.delete(document)
    this.#schedule()
  }

  #schedule(): void {
    if (!this.#active || this.#timer !== undefined) return
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      const { document } = this.#workbench.state
      if (this.#document !== undefined && this.#document !== document) this.#send(this.#document, [])
      this.#document = document
      if (document === undefined) return
      const findings: AuthoringDiagnostics['findings'] = this.state.getSnapshot().issues.filter(issue => issue.document === document).map(({ checkId, message, authoringSource }) => ({ checkId, message, severity: 'error', ...authoringSource ? { authoringSource } : {} }))
      this.#send(document, findings)
    }, 100)
  }

  #send(document: string, findings: AuthoringDiagnostics['findings']): void {
    const signature = JSON.stringify(findings)
    if (this.#attempted.get(document) === signature) return
    this.#attempted.delete(document)
    this.#attempted.set(document, signature)
    while (this.#attempted.size > LIMIT * 2) this.#attempted.delete(this.#attempted.keys().next().value!)
    const report: AuthoringDiagnostics = { document, instance: this.#instance, findings }
    const current = () => this.#active && this.#workbench.state.document === document && this.#attempted.get(document) === signature
    this.#reports = this.#reports.then(async () => {
      // A queued failure may belong to a document that was closed before delivery.
      // Empty reports still clear this instance's old contribution in queue order.
      if (findings.length && !current()) {
        if (this.#attempted.get(document) === signature) this.#attempted.delete(document)
        return
      }
      try {
        const result = await this.#workbench.client.reportAuthoringDiagnostics(report) as { accepted?: boolean }
        const failed = result?.accepted !== true
        if (current()) this.state.set({ ...this.state.getSnapshot(), reportFailed: failed })
      } catch {
        if (current()) this.state.set({ ...this.state.getSnapshot(), reportFailed: true })
      }
    })
  }
}

export function runtimeDiagnostics(workbench: Workbench): WorkbenchRuntimeDiagnostics {
  let diagnostics = instances.get(workbench)
  if (!diagnostics) { diagnostics = new WorkbenchRuntimeDiagnostics(workbench); instances.set(workbench, diagnostics) }
  return diagnostics
}

export function RuntimeDiagnosticsNotice({ workbench, fatal = false }: { workbench: Workbench, fatal?: boolean }) {
  const diagnostics = runtimeDiagnostics(workbench)
  const snapshot = useSyncExternalStore(diagnostics.state.subscribe, diagnostics.state.getSnapshot)
  useSyncExternalStore(workbench.subscribe, workbench.getState)
  const t = useClientMessages(workbench)
  const issues = diagnostics.visible()
  if (!fatal && !issues.length) return null
  return <div className="pmw-runtime-feedback"><PmNotice tone="danger">
    <p>{fatal ? t.runtimeStopped : t.runtimeProblems}</p>
    {issues.length > 0 && <details><summary>{t.runtimeDetails}</summary><ul>{issues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul></details>}
    {snapshot.reportFailed && <p>{t.runtimeReportFailed}</p>}
    <div className="pmw-runtime-feedback__actions">
      {snapshot.reportFailed && <PmButton small onClick={() => diagnostics.retry()}>{t.runtimeRetry}</PmButton>}
      {!fatal && <PmButton small onClick={() => diagnostics.dismiss()}>{t.runtimeDismiss}</PmButton>}
      <PmButton small icon="refresh" onClick={() => location.reload()}>{t.runtimeReload}</PmButton>
    </div>
  </PmNotice></div>
}

export class WorkbenchRuntimeBoundary extends Component<{ workbench: Workbench, children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error): void { runtimeDiagnostics(this.props.workbench).capture(error) }
  render() {
    return this.state.failed ? <main className="pmw-runtime-fallback pm-ui"><RuntimeDiagnosticsNotice workbench={this.props.workbench} fatal /></main> : this.props.children
  }
}
