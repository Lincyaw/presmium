import { errorMessage, failedRun } from '@presmium/kernel'
import type { Executor, ExecutorRouter, RunRequest, RunResult } from '@presmium/kernel'

interface Entry {
  executor: Executor
  priority: number
  order: number
}

/** The router's own errors, in the language of the page (the client passes its catalog). */
export interface RouterText {
  noExecutor(lang: string): string
  /** The executor a request names is not registered, or does not run its language. */
  executorUnavailable(executor: string, lang: string): string
  executorCrashed(executor: string, error: string): string
}

/**
 * The `executor` service: a request that names an executor (`RunRequest.executor`,
 * the code block's `:env:` or `:executor:`) goes to that executor only; when
 * it is not registered or does not run the language, the result is a failed
 * run, and the recorded output stands in (P-24), never another executor
 * (docs/review-round2.md, decision 5). Other requests go to the registered
 * executor with the highest priority that supports their language (earlier
 * registration wins a tie). An executor that throws yields a failed result
 * instead of an exception. Sessions (`RunRequest.session`, the code's
 * `:session:`) are the page's: the router names them after the page instance
 * it serves, so remote kernels keep each page's and each learner's apart
 * (P-101); ending a session ends it in every executor.
 */
export function createExecutorRouter(text: RouterText, id = 'presmium.exec.router'): ExecutorRouter {
  let entries: Entry[] = []
  let registrations = 0
  const page = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const scoped = (session: string) => `${session}@${page}`
  const pick = (lang: string) => entries.find(entry => entry.executor.supports(lang))?.executor

  return {
    id,
    supports: lang => pick(lang) !== undefined,
    async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
      const named = request.executor
      const executor = named ? entries.find(entry => entry.executor.id === named)?.executor : pick(request.lang)
      if (named && !executor?.supports(request.lang)) return failedRun(id, text.executorUnavailable(named, request.lang))
      if (!executor) return failedRun(id, text.noExecutor(request.lang))
      const started = Date.now()
      try {
        return await executor.run(request.session ? { ...request, session: scoped(request.session) } : request, signal)
      } catch (error) {
        return failedRun(executor.id, text.executorCrashed(executor.id, errorMessage(error)), Date.now() - started)
      }
    },
    async endSession(session) {
      await Promise.all(entries.map(entry => entry.executor.endSession?.(scoped(session)).catch(() => {})))
    },
    register(executor, priority = 0) {
      const entry = { executor, priority, order: registrations++ }
      entries = [...entries, entry].sort((a, b) => b.priority - a.priority || a.order - b.order)
      return () => {
        entries = entries.filter(e => e !== entry)
      }
    },
    list: () => entries.map(entry => entry.executor),
  }
}
