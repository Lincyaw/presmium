import { createResidentWorker } from '@lincyaw/host'
import { failedRun } from '@lincyaw/kernel'
import type { Executor, RunRequest, RunResult } from '@lincyaw/kernel'
import { isPython } from '../../domain/index.ts'
import type { Trace, Tracer } from '../../domain/index.ts'
import { messages } from '../messages.ts'
import type { WorkerReply, WorkerRequest, WorkerRunResult, WorkerTraceResult } from './protocol.ts'

export const PYODIDE_EXECUTOR_ID = 'pyodide'

export interface PyodideExecutorOptions {
  indexURL: string
  timeoutMs: number
  loadTimeoutMs: number
  maxTraceEvents: number
}

export type PyodideExecutor = Executor & Tracer & {
  dispose(): void
}

type Outcome<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; error: string; timedOut: boolean; durationMs: number }

export function createPyodideExecutor(options: PyodideExecutorOptions): PyodideExecutor {
  const id = PYODIDE_EXECUTOR_ID
  const traces = new Map<string, Promise<Trace>>()
  const resident = createResidentWorker<WorkerRequest, WorkerReply>({
    start: () => new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module', name: 'presmium-pyodide' }),
    loadTimeoutMs: options.loadTimeoutMs,
  })

  async function send<T>(kind: WorkerRequest['kind'], request: RunRequest, signal?: AbortSignal): Promise<Outcome<T>> {
    const timeoutMs = request.timeoutMs ?? options.timeoutMs
    const indexURL = new URL(options.indexURL, location.href).href
    const outcome = await resident.send({ kind, request: plain(request), indexURL, maxEvents: options.maxTraceEvents }, { timeoutMs, signal })
    if ('reply' in outcome) {
      const { reply } = outcome
      return reply.type === 'done'
        ? { ok: true, value: reply.value as T, durationMs: reply.durationMs }
        : { ok: false, error: reply.error, timedOut: false, durationMs: outcome.elapsedMs }
    }
    const t = messages()
    const error = {
      'cancelled': t.cancelled,
      'load-timeout': t.loadTimeout('Python', options.loadTimeoutMs),
      'run-timeout': t.runTimeout(timeoutMs),
      'crashed': t.runtimeCrashed('Python', outcome.error ?? ''),
    }[outcome.failure]
    return { ok: false, error, timedOut: outcome.failure === 'load-timeout' || outcome.failure === 'run-timeout', durationMs: outcome.elapsedMs }
  }

  return {
    id,
    runsIn: 'browser',
    supports: isPython,
    async run(request, signal): Promise<RunResult> {
      const outcome = await send<WorkerRunResult>('run', request, signal)
      if (!outcome.ok) return { ...failedRun(id, outcome.error, outcome.durationMs), timedOut: outcome.timedOut }
      const { stdout, stderr, exitCode, outputs } = outcome.value
      const unavailable = outputs?.find(output => output.output_type === 'error' && output.ename === 'GPUUnavailable')
      if (unavailable?.output_type === 'error') return { ...failedRun(id, messages().gpuUnavailable(unavailable.evalue), outcome.durationMs), stdout }
      return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: outcome.durationMs, timedOut: false, source: 'live', executorId: id, ...outputs ? { outputs } : {} }
    },
    async endSession(session) {
      if (resident.hasWorker()) await send<null>('end', { lang: 'python', code: '', session })
    },
    dispose() {
      resident.dispose()
      traces.clear()
    },
    trace(request, signal) {
      const key = JSON.stringify([request.code, request.args, request.stdin, request.files])
      let trace = traces.get(key)
      if (!trace) {
        trace = send<WorkerTraceResult>('trace', request, signal).then(toTrace, (error: unknown) => ({ events: [], truncated: false, error: String(error) }))
        traces.set(key, trace)
        void trace.then(t => t.error !== undefined && traces.delete(key))
      }
      return trace
    },
  }
}

function toTrace(outcome: Outcome<WorkerTraceResult>): Trace {
  if (!outcome.ok) return { events: [], truncated: false, error: outcome.error }
  const { events, truncated, output } = outcome.value
  return events.length ? { events, truncated } : { events, truncated, error: output || undefined }
}

function plain(request: RunRequest): RunRequest {
  return JSON.parse(JSON.stringify(request)) as RunRequest
}
