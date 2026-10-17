/**
 * The control channel and approvals (docs/architecture.md 10.4). Each page
 * window holds an SSE stream (`GET /__presmium/presmium.server/control`) and
 * reports its position, view role and the plugins' status summaries
 * (`POST`). The server sends `go`, `session` and the approvals a window may
 * answer, dispatched by scope: `content` to the member it is asked for (or
 * every editor and owner), `workspace` to the owners only; in SHARED mode
 * the `workspace` ones go to the owner console's windows only, and an
 * owner's site windows learn how many wait there.
 */
import { randomUUID } from 'node:crypto'
import type { ApprovalKind, ApprovalRequest, Approvals, Member, MemberRole } from '@presmium/kernel'

/** How each kind of approval is decided: not offered, asked, or allowed without asking. */
export type ApprovalPolicy = 'off' | 'ask' | 'allow'

/** No answer within this time is a denial: below DeepSeek Harness's 60 s timeout of an MCP tool call. */
export const APPROVAL_TIMEOUT_MS = 50_000

/** A position a window reports (the `navigation` service's). */
export interface WindowPosition {
  slide: number
  step: number
  view?: string
}

export interface WindowReport {
  position?: WindowPosition
  role?: string
  status?: Record<string, unknown>
  /** When it was reported (ms since the epoch). */
  at: number
}

interface Window {
  id: string
  member: Member
  document: string
  /** A window of the owner console (SHARED). */
  console: boolean
  /** The owner console's address, for an owner's site window (SHARED). */
  consoleUrl?: string
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

export function hasRole(member: Member, role: MemberRole): boolean {
  const rank: Record<MemberRole, number> = { reader: 0, editor: 1, owner: 2 }
  return member.roles.some(own => rank[own] >= rank[role])
}

export interface ControlOptions {
  shared: boolean
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

  /** The `APPROVALS` service. */
  readonly approvals: Approvals = {
    request: (request, signal) => this.#request(request, signal),
  }

  /** Opens a window's stream; returns the stream of events, ended by `close`. */
  open(id: string, member: Member, document: string, console: boolean, consoleUrl?: string): AsyncIterable<{ event: string, data: unknown }> & { close(): void } {
    this.#windows.get(id)?.close()
    const queue: { event: string, data: unknown }[] = []
    let wake: (() => void) | undefined
    let closed = false
    const window: Window = {
      id,
      member,
      document,
      console,
      consoleUrl,
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
      if (this.#mayAnswer(window, pending.request)) window.send('approval', { id: pending.id, request: pending.request })
    }
    this.#summarize(window, true)
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

  /** A window's report; false when the window is unknown or another member's. */
  report(id: string, member: Member, report: Omit<WindowReport, 'at'>): boolean {
    const window = this.#windows.get(id)
    if (!window || window.member.id !== member.id) return false
    const moved = JSON.stringify(report.position) !== JSON.stringify(window.report?.position)
    window.report = { ...report, at: Date.now() }
    if (moved) for (const listener of [...this.#watchers]) listener()
    return true
  }

  /** Calls `listener` whenever a window reports a new position (MCP's `presmium://position`); returns the function that stops it. */
  watch(listener: () => void): () => void {
    this.#watchers.add(listener)
    return () => void this.#watchers.delete(listener)
  }

  /** The policy of a kind of approval: the operations of an `off` kind are not offered (MCP does not list their tools). */
  policy(kind: ApprovalKind): ApprovalPolicy {
    return this.#options.policy[kind] ?? 'ask'
  }

  /**
   * Asks even when the policy of the kind is `allow`: SHARED mode's `run_code`
   * under `compile: approve`, which only the owner's answer lets through (10.6).
   */
  ask(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean> {
    return this.#request(request, signal, true)
  }

  /**
   * An answer to an approval: 404 when there is none of this id, 403 when
   * this member may not answer it here (`console`: the request came from the
   * owner console's origin with its header), else settled.
   */
  answer(id: string, allow: boolean, member: Member, console: boolean): 200 | 403 | 404 {
    const pending = this.#pending.get(id)
    if (!pending) return 404
    if (!this.#eligible(member, console, pending.request)) return 403
    pending.settle(allow)
    return 200
  }

  /**
   * The positions the windows last reported (of `member`, of one document,
   * when given), newest first, the present and presenter windows before the
   * others (MCP's `get_position`).
   */
  positions(member?: Member, document?: string): { window: string, member: string, document: string, report: WindowReport }[] {
    const all = [...this.#windows.values()].filter(w => w.report?.position && !w.console && (!member || w.member.id === member.id) && (document === undefined || w.document === document))
    const rank = (w: Window) => (w.report?.role === 'presenter' || w.report?.role === 'audience' ? 0 : 1)
    return all.sort((a, b) => rank(a) - rank(b) || b.report!.at - a.report!.at)
      .map(w => ({ window: w.id, member: w.member.id, document: w.document, report: w.report! }))
  }

  /** Sends `go` to the windows (of `member`, of one document, when given) of the present and presenter views, or to all of them when none presents. */
  go(position: WindowPosition, member?: Member, document?: string): number {
    const windows = [...this.#windows.values()].filter(w => !w.console && (!member || w.member.id === member.id) && (document === undefined || w.document === document))
    const presenting = windows.filter(w => w.report?.role === 'presenter' || w.report?.role === 'audience')
    const targets = presenting.length > 0 ? presenting : windows
    for (const window of targets) window.send('go', position)
    return targets.length
  }

  /** Starts or ends the classroom in the windows (of `member` and of one document, when given) of the present and presenter views. */
  session(action: 'start' | 'end', name?: string, document?: string, member?: Member): number {
    const windows = [...this.#windows.values()].filter(w => !w.console && (!member || w.member.id === member.id) && (document === undefined || w.document === document) && (w.report?.role === 'presenter' || w.report?.role === 'audience'))
    for (const window of windows) window.send('session', { action, name })
    return windows.length
  }

  /** The plugins' status summaries the windows (of one document, when given) reported, the newest of each plugin. */
  status(document?: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const windows = [...this.#windows.values()].filter(w => w.report?.status && (document === undefined || w.document === document)).sort((a, b) => a.report!.at - b.report!.at)
    for (const window of windows) Object.assign(out, window.report!.status)
    return out
  }

  close(): void {
    for (const pending of [...this.#pending.values()]) pending.settle(false)
    for (const window of [...this.#windows.values()]) window.close()
  }

  #request(request: ApprovalRequest, signal?: AbortSignal, ask = false): Promise<boolean> {
    const policy = this.#options.policy[request.kind] ?? 'ask'
    if (policy === 'allow' && !ask) return Promise.resolve(true)
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
          for (const window of this.#windows.values()) {
            window.send('settled', { id, allow })
            this.#summarize(window)
          }
          resolve(allow)
        },
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#pending.set(id, pending)
      for (const window of this.#windows.values()) {
        if (this.#mayAnswer(window, pending.request)) window.send('approval', { id, request: pending.request })
        this.#summarize(window)
      }
    })
  }

  /** Whether a window gets an approval to answer. */
  #mayAnswer(window: Window, request: ApprovalRequest): boolean {
    return this.#eligible(window.member, window.console, request)
  }

  /**
   * Who may answer (10.4): a `content` approval, the member it is asked for
   * (every editor and owner when none); a `workspace` one, an owner only, in
   * SHARED mode on the owner console only. The console answers nothing else.
   */
  #eligible(member: Member, console: boolean, request: ApprovalRequest): boolean {
    if ((request.scope ?? 'workspace') === 'workspace') return hasRole(member, 'owner') && (!this.#options.shared || console)
    if (console) return false
    return request.member ? member.id === request.member : hasRole(member, 'editor')
  }

  /** In SHARED mode an owner's site window learns how many `workspace` approvals wait in the console. */
  #summarize(window: Window, opening = false): void {
    if (!this.#options.shared || window.console || !hasRole(window.member, 'owner')) return
    const count = [...this.#pending.values()].filter(p => (p.request.scope ?? 'workspace') === 'workspace').length
    if (opening && count === 0) return
    window.send('pending', { count, console: window.consoleUrl })
  }
}
