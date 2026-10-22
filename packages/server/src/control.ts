import { randomUUID } from 'node:crypto'
import { hasRole, isPresentingRole, pushStream } from '@lincyaw/kernel'
import type { ApprovalKind, ApprovalRequest, Approvals, Member, MemberRole, PushStream } from '@lincyaw/kernel'

export type ApprovalPolicy = 'off' | 'ask' | 'allow'

export const APPROVAL_TIMEOUT_MS = 50_000

export interface WindowPosition {
  slide: number
  step: number
  view?: string
  section?: string
  trail?: string[]
}

export interface WindowReport {
  position?: WindowPosition
  role?: string
  status?: Record<string, unknown>
  at: number
}

export interface WindowFilter {
  member?: Member
  document?: string
}

interface Window {
  id: string
  member: Member
  document: string
  report?: WindowReport
  send(event: string, data: unknown): void
  close(): void
}

interface Pending {
  id: string
  request: ApprovalRequest
  document: string
  settle(allow: boolean): void
}

function isPresenting(window: Window): boolean {
  return isPresentingRole(window.report?.role)
}

export interface ControlOptions {
  policy: Partial<Record<ApprovalKind, ApprovalPolicy>>
  timeoutMs?: number
}

export class ControlChannel {
  readonly #windows = new Map<string, Window>()
  readonly #pending = new Map<string, Pending>()
  readonly #watchers = new Set<() => void>()
  readonly #options: ControlOptions

  constructor(options: ControlOptions) {
    this.#options = options
  }

  readonly approvals: Approvals = {
    request: (request, signal) => this.#request(request, signal),
  }

  open(id: string, member: Member, document: string): PushStream<{ event: string, data: unknown }> {
    this.#windows.get(id)?.close()
    let window!: Window
    const stream = pushStream<{ event: string, data: unknown }>((push) => {
      window = { id, member, document, send: (event, data) => push({ event, data }), close: () => stream.end() }
      this.#windows.set(id, window)
      return () => {
        if (this.#windows.get(id) === window) this.#windows.delete(id)
      }
    })
    window.send('ready', { window: id })
    for (const pending of this.#pending.values()) {
      if (this.#eligible(member, pending.request)) window.send('approval', { id: pending.id, request: pending.request })
    }
    return stream
  }

  report(id: string, member: Member, report: Omit<WindowReport, 'at'>): boolean {
    const window = this.#windows.get(id)
    if (!window || window.member.id !== member.id) return false
    const moved = JSON.stringify(report.position) !== JSON.stringify(window.report?.position)
    window.report = { ...report, at: Date.now() }
    if (moved) for (const listener of [...this.#watchers]) listener()
    return true
  }

  watch(listener: () => void): () => void {
    this.#watchers.add(listener)
    return () => void this.#watchers.delete(listener)
  }

  policy(kind: ApprovalKind): ApprovalPolicy {
    return this.#options.policy[kind] ?? 'ask'
  }

  answer(id: string, allow: boolean, member: Member): 200 | 403 | 404 {
    const pending = this.#pending.get(id)
    if (!pending) return 404
    if (!this.#eligible(member, pending.request)) return 403
    pending.settle(allow)
    return 200
  }

  positions(filter: WindowFilter & { viewer?: Member } = {}): { window: string, member: string, roles: MemberRole[], document: string, report: WindowReport }[] {
    const all = this.#windowsOf(filter).filter(w => w.report?.position)
    const trusted = (w: Window) => hasRole(w.member, 'editor') || w.member.id === filter.viewer?.id
    const rank = (w: Window) => (!trusted(w) ? 2 : isPresenting(w) ? 0 : 1)
    return all.sort((a, b) => rank(a) - rank(b) || b.report!.at - a.report!.at)
      .map(w => ({ window: w.id, member: w.member.id, roles: w.member.roles, document: w.document, report: w.report! }))
  }

  go(position: WindowPosition, filter: WindowFilter = {}): number {
    const windows = this.#windowsOf(filter)
    const presenting = windows.filter(isPresenting)
    const targets = presenting.length > 0 ? presenting : windows
    for (const window of targets) window.send('go', position)
    return targets.length
  }

  setClassroom(action: 'start' | 'end', name: string | undefined, filter: WindowFilter = {}): number {
    const windows = this.#windowsOf(filter).filter(isPresenting)
    for (const window of windows) window.send('session', { action, name })
    return windows.length
  }

  status(document?: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const rank = (w: Window) => (w.report?.role === 'presenter' ? 1 : 0)
    const windows = [...this.#windows.values()]
      .filter(w => w.report?.status && hasRole(w.member, 'editor') && (document === undefined || w.document === document))
      .sort((a, b) => rank(a) - rank(b) || a.report!.at - b.report!.at)
    for (const window of windows) Object.assign(out, window.report!.status)
    return out
  }

  runtime(document: string): { window: string, report: WindowReport }[] {
    return [...this.#windows.values()]
      .filter(window => window.document === document && window.report?.status && hasRole(window.member, 'editor'))
      .sort((a, b) => b.report!.at - a.report!.at)
      .slice(0, 8)
      .map(window => ({ window: window.id, report: window.report! }))
  }

  close(): void {
    for (const pending of [...this.#pending.values()]) pending.settle(false)
    for (const window of [...this.#windows.values()]) window.close()
  }

  #request(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean> {
    const policy = this.#options.policy[request.kind] ?? 'ask'
    if (policy === 'allow') return Promise.resolve(true)
    if (policy === 'off' || signal?.aborted) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const id = randomUUID()
      const timer = setTimeout(() => pending.settle(false), this.#options.timeoutMs ?? APPROVAL_TIMEOUT_MS)
      const onAbort = () => pending.settle(false)
      const pending: Pending = {
        id,
        request: { ...request, scope: request.scope ?? 'workspace' },
        document: '',
        settle: (allow) => {
          if (!this.#pending.delete(id)) return
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          for (const window of this.#windows.values()) window.send('settled', { id, allow })
          resolve(allow)
        },
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#pending.set(id, pending)
      for (const window of this.#windows.values()) {
        if (this.#eligible(window.member, pending.request)) window.send('approval', { id, request: pending.request })
      }
    })
  }

  #windowsOf(filter: WindowFilter): Window[] {
    return [...this.#windows.values()].filter(w => (!filter.member || w.member.id === filter.member.id) && (filter.document === undefined || w.document === filter.document))
  }

  #eligible(member: Member, request: ApprovalRequest): boolean {
    if ((request.scope ?? 'workspace') === 'workspace') return hasRole(member, 'owner')
    return request.member ? member.id === request.member : hasRole(member, 'editor')
  }
}
