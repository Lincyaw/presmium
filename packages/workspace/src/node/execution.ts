/**
 * Compile-time execution in `presmium serve` (docs/architecture.md 10.6). In
 * LOCAL mode everything runs. In SHARED mode code without a recording runs
 * by `settings.presmium.exec.compile`: `trusted` runs it, `off` never does,
 * `approve` (default) gathers the code a compilation would run into one
 * `operate` approval of `workspace` scope, which only the owner answers on
 * the owner console; on an allow the code runs. A document has at most one
 * approval waiting; code waiting, denied or timed out is not asked for again
 * by itself: a change of the code (a new cache key) or an editor's "request
 * execution" asks again. A reader's visit never asks. What was allowed or
 * refused is kept in memory only.
 *
 * serve's own compilation runs nothing and records nothing (WP-91): the code
 * that may run is handed to agent-host, which compiles the document, runs it
 * and writes its recordings as the sandbox; then the document compiles again
 * here and takes them from the execution cache. Code handed over once is not
 * handed over again by itself (a run that timed out leaves no recording).
 */
import { createHash } from 'node:crypto'
import type { OperatorSettings } from '@presmium/compiler'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { Approvals, Logger, Member } from '@presmium/kernel'
import type { ExecutionState } from '../domain/api.ts'
import type { DocumentSession } from './session.ts'
import type { PendingRun } from './types.ts'

export type CompileMode = 'approve' | 'trusted' | 'off'

/** `settings.presmium.exec.compile`; default `approve`. */
export function compileMode(settings: Record<string, Record<string, unknown>>): CompileMode {
  const value = settings['presmium.exec']?.compile
  return value === 'trusted' || value === 'off' ? value : 'approve'
}

interface DocumentState {
  allowed: Set<string>
  refused: Set<string>
  /** The keys of the runs handed to agent-host to run and record. */
  sent: Set<string>
  /** The keys of the approval that waits. */
  pending?: Set<string>
  /** The runs the last compilation did not run (all of them: serve runs none). */
  notRun: PendingRun[]
}

/** A run's identity: what it runs and with which executor (its cache key changes with the code); agent-host finds it by the same. */
export function runKey(run: PendingRun): string {
  return createHash('sha256').update(JSON.stringify([run.executor, run.request])).digest('hex')
}

/** Runs and records runs of a document elsewhere (agent-host); resolves once their recordings are written. */
export type RecordRuns = (document: string, runs: PendingRun[], member: Member | undefined) => Promise<void>

export class CompileApprovals {
  readonly mode: CompileMode
  readonly #approvals: () => Approvals | undefined
  readonly #record: RecordRuns
  readonly #documents = new Map<string, DocumentState>()
  readonly #log: Logger

  constructor(mode: CompileMode, approvals: () => Approvals | undefined, record: RecordRuns, log: Logger) {
    this.mode = mode
    this.#approvals = approvals
    this.#record = record
    this.#log = log
  }

  #state(dir: string): DocumentState {
    let state = this.#documents.get(dir)
    if (!state) this.#documents.set(dir, state = { allowed: new Set(), refused: new Set(), sent: new Set(), notRun: [] })
    return state
  }

  /**
   * The compiler's `admit` for a document's session: none of the runs happens in serve. Those that may
   * run (all with `trusted`, the allowed ones with `approve`) go to agent-host once; the new ones are asked
   * for when the compilation may.
   */
  admit(sessionOf: () => DocumentSession, title: () => string, lang: () => string | undefined, member: () => Member | undefined): (runs: PendingRun[]) => PendingRun[] {
    return (runs) => {
      const session = sessionOf()
      const state = this.#state(session.dir)
      state.notRun = runs
      const may = this.mode === 'trusted' ? runs : this.mode === 'off' ? [] : runs.filter(run => state.allowed.has(runKey(run)))
      const unsent = may.filter(run => !state.sent.has(runKey(run)))
      if (unsent.length > 0) this.#send(session, state, unsent, member())
      if (this.mode === 'approve' && session.trigger.mayAsk && !state.pending) {
        const fresh = runs.filter(run => !state.allowed.has(runKey(run)) && !state.refused.has(runKey(run)))
        if (fresh.length > 0) this.#ask(session, state, fresh, title(), lang(), member())
      }
      return []
    }
  }

  /** An editor's "request execution": the code of the document that did not run is asked for, or handed over, again (when no approval waits). */
  requestAgain(session: DocumentSession): void {
    const state = this.#state(session.dir)
    for (const run of state.notRun) {
      state.refused.delete(runKey(run))
      state.sent.delete(runKey(run))
    }
    void session.recompile({ mayAsk: true }).catch(() => undefined)
  }

  state(dir: string, local: boolean): ExecutionState {
    const state = this.#documents.get(dir)
    return {
      mode: local ? 'local' : this.mode,
      notRun: (state?.notRun ?? []).map(run => `${run.section}#${run.block}`),
      pending: Boolean(state?.pending),
    }
  }

  forget(dir: string): void {
    this.#documents.delete(dir)
  }

  /** Hands runs to agent-host to run and record; once recorded, the document compiles again and takes them from the cache. */
  #send(session: DocumentSession, state: DocumentState, runs: PendingRun[], member: Member | undefined): void {
    for (const run of runs) state.sent.add(runKey(run))
    void this.#record(session.dir, runs, member).then(
      () => session.recompile({ mayAsk: true }),
      (error: unknown) => this.#log.error(`the code of ${session.dir || '.'} did not run in agent-host: ${errorMessage(error)}`),
    ).catch(() => undefined)
  }

  #ask(session: DocumentSession, state: DocumentState, runs: PendingRun[], title: string, lang: string | undefined, member: Member | undefined): void {
    const approvals = this.#approvals()
    if (!approvals) return
    const keys = new Set(runs.map(runKey))
    state.pending = keys
    const zh = !lang || lang.toLowerCase().startsWith('zh')
    const request = {
      kind: 'operate' as const,
      scope: 'workspace' as const,
      title: zh ? `运行《${title}》中没有录制的 ${runs.length} 段代码` : `Run ${runs.length} code block${runs.length === 1 ? '' : 's'} without a recording of "${title}"`,
      detail: runs.map(run => `${run.section}#${run.block} (${run.executor}, ${run.request.lang})\n${run.request.code}`).join('\n\n'),
      from: 'presmium.workspace',
      ...member ? { member: member.id } : {},
    }
    void approvals.request(request).then((allow) => {
      state.pending = undefined
      for (const key of keys) (allow ? state.allowed : state.refused).add(key)
      this.#log.info(`compile approval of ${session.dir || '.'}: ${allow ? 'allowed' : 'refused'}`)
      if (allow) return session.recompile({ mayAsk: true })
    }).catch((error: unknown) => {
      state.pending = undefined
      this.#log.error(`compile approval of ${session.dir || '.'} failed: ${errorMessage(error)}`)
    })
  }
}

/** `settings.presmium.exec.passEnv` as given (the compiler reads it itself; listed here for the agent-host's runs). */
export function passEnv(settings: OperatorSettings): string[] {
  const exec = settings['presmium.exec']
  return isRecord(exec) && Array.isArray(exec.passEnv) ? exec.passEnv.filter((name): name is string => typeof name === 'string') : []
}
