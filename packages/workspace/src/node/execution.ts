/**
 * Compile-time execution in `presmium serve` (docs/architecture.md 10.6). In
 * LOCAL mode everything runs. In SHARED mode code without a recording runs
 * by `settings.presmium.exec.compile`: `trusted` runs it, `off` never does,
 * `approve` (default) gathers the code a compilation would run into one
 * `operate` approval of `workspace` scope, which only the owner answers on
 * the owner console; on an allow the document compiles again and the code
 * runs (in agent-host). A document has at most one approval waiting; code
 * waiting, denied or timed out is not asked for again by itself: a change of
 * the code (a new cache key) or an editor's "request execution" asks again.
 * A reader's visit never asks. What was allowed or refused is kept in memory only.
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
  /** The keys of the approval that waits. */
  pending?: Set<string>
  /** The runs the last compilation did not let happen. */
  notRun: PendingRun[]
}

/** A run's identity: what it runs and with which executor (its cache key changes with the code). */
function runKey(run: PendingRun): string {
  return createHash('sha256').update(JSON.stringify([run.executor, run.request])).digest('hex')
}

export class CompileApprovals {
  readonly mode: CompileMode
  readonly #approvals: () => Approvals | undefined
  readonly #documents = new Map<string, DocumentState>()
  readonly #log: Logger

  constructor(mode: CompileMode, approvals: () => Approvals | undefined, log: Logger) {
    this.mode = mode
    this.#approvals = approvals
    this.#log = log
  }

  #state(dir: string): DocumentState {
    let state = this.#documents.get(dir)
    if (!state) this.#documents.set(dir, state = { allowed: new Set(), refused: new Set(), notRun: [] })
    return state
  }

  /** The compiler's `admit` for a document's session: the runs allowed now; asks for the new ones when the compilation may. */
  admit(sessionOf: () => DocumentSession, title: () => string, lang: () => string | undefined, member: () => Member | undefined): (runs: PendingRun[]) => PendingRun[] {
    return (runs) => {
      const session = sessionOf()
      const state = this.#state(session.dir)
      if (this.mode === 'trusted') return runs
      const allowed = this.mode === 'off' ? [] : runs.filter(run => state.allowed.has(runKey(run)))
      state.notRun = runs.filter(run => !allowed.includes(run))
      if (this.mode === 'approve' && session.trigger.mayAsk && !state.pending) {
        const fresh = state.notRun.filter(run => !state.refused.has(runKey(run)))
        if (fresh.length > 0) this.#ask(session, state, fresh, title(), lang(), member())
      }
      return allowed
    }
  }

  /** An editor's "request execution": the code of the document that did not run is asked for again (when no approval waits). */
  requestAgain(session: DocumentSession): void {
    const state = this.#state(session.dir)
    for (const run of state.notRun) state.refused.delete(runKey(run))
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
