import { randomUUID } from 'node:crypto'
import type { ApprovalKind, ApprovalRequest, Approvals, Member, MemberRole } from '@presmium/kernel'

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

function presents(window: { report?: WindowReport }): boolean {
  return window.report?.role === 'presenter' || window.report?.role === 'audience'
}

export function hasRole(member: Member, role: MemberRole): boolean {
  const rank: Record<MemberRole, number> = { reader: 0, editor: 1, owner: 2 }
  return member.roles.some(own => rank[own] >= rank[role])
}

export interface ControlOptions {
  policy: Partial<Record<ApprovalKind, ApprovalPolicy>>
  timeoutMs?: number
}

export class Control {
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

  open(id: string, member: Member, document: string): AsyncIterable<{ event: string, data: unknown }> & { close(): void } {
    this.#windows.get(id)?.close()
    const queue: { event: string, data: unknown }[] = []
    let wake: (() => void) | undefined
    let closed = false
    const window: Window = {
      id,
      member,
      document,
      send(event, data) {
        if (closed) return
        queue.push({ event, data })
        wake?.()
      },
      close: () => {
        closed = true
        if (this.#windows.get(id) === window) this.#windows.delete(id)
        wake?.()
      },
    }
    this.#windows.set(id, window)
    window.send('ready', { window: id })
    for (const pending of this.#pending.values()) {
      if (this.#eligible(member, pending.request)) window.send('approval', { id: pending.id, request: pending.request })
    }
    const stream = {
      close: window.close,
      async* [Symbol.asyncIterator]() {
        try {
          while (!closed) {
            while (queue.length > 0) yield queue.shift()!
            if (closed) break
            await new Promise<void>(resolve => wake = resolve)
            wake = undefined
          }
        } finally {
          window.close()
        }
      },
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

  positions(member?: Member, document?: string, viewer?: Member): { window: string, member: string, roles: MemberRole[], document: string, report: WindowReport }[] {
    const all = [...this.#windows.values()].filter(w => w.report?.position && (!member || w.member.id === member.id) && (document === undefined || w.document === document))
    const trusted = (w: Window) => hasRole(w.member, 'editor') || w.member.id === viewer?.id
    const rank = (w: Window) => (!trusted(w) ? 2 : presents(w) ? 0 : 1)
    return all.sort((a, b) => rank(a) - rank(b) || b.report!.at - a.report!.at)
      .map(w => ({ window: w.id, member: w.member.id, roles: w.member.roles, document: w.document, report: w.report! }))
  }

  go(position: WindowPosition, member?: Member, document?: string): number {
    const windows = [...this.#windows.values()].filter(w => (!member || w.member.id === member.id) && (document === undefined || w.document === document))
    const presenting = windows.filter(w => w.report?.role === 'presenter' || w.report?.role === 'audience')
    const targets = presenting.length > 0 ? presenting : windows
    for (const window of targets) window.send('go', position)
    return targets.length
  }

  session(action: 'start' | 'end', name?: string, document?: string, member?: Member): number {
    const windows = [...this.#windows.values()].filter(w => (!member || w.member.id === member.id) && (document === undefined || w.document === document) && (w.report?.role === 'presenter' || w.report?.role === 'audience'))
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

  #eligible(member: Member, request: ApprovalRequest): boolean {
    if ((request.scope ?? 'workspace') === 'workspace') return hasRole(member, 'owner')
    return request.member ? member.id === request.member : hasRole(member, 'editor')
  }
}
