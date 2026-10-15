import type { Executor, ExecutorRouter, RunRequest, RunResult } from '@presmium/kernel'

interface Entry {
  executor: Executor
  priority: number
  order: number
}

/** The router's own errors, in the language of the page (the client passes its catalog). */
export interface RouterText {
  noExecutor(lang: string): string
  executorCrashed(executor: string, error: string): string
}

/** A failed result produced without running anything (no executor, executor crash, aborted). */
export function failedRun(executorId: string, stderr: string, durationMs = 0): RunResult {
  return { ok: false, stdout: '', stderr, exitCode: null, durationMs, timedOut: false, source: 'live', executorId }
}

/**
 * The `executor` service: routes each request to the registered executor with
 * the highest priority that supports its language (earlier registration wins a
 * tie). An executor that throws yields a failed result instead of an exception.
 */
export function createExecutorRouter(text: RouterText, id = 'presmium.exec.router'): ExecutorRouter {
  let entries: Entry[] = []
  let registrations = 0
  const pick = (lang: string) => entries.find(entry => entry.executor.supports(lang))?.executor

  return {
    id,
    supports: lang => pick(lang) !== undefined,
    async run(request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
      const executor = pick(request.lang)
      if (!executor) return failedRun(id, text.noExecutor(request.lang))
      const started = Date.now()
      try {
        return await executor.run(request, signal)
      } catch (error) {
        return failedRun(executor.id, text.executorCrashed(executor.id, error instanceof Error ? error.message : String(error)), Date.now() - started)
      }
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
