import { errorMessage, failedRun } from '@lincyaw/kernel'
import type { Executor, ExecutorRouter, RunRequest, RunResult } from '@lincyaw/kernel'

interface Entry {
  executor: Executor
  priority: number
  order: number
}

export interface RouterText {
  noExecutor(lang: string): string
  executorUnavailable(executor: string, lang: string): string
  executorCrashed(executor: string, error: string): string
}

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
