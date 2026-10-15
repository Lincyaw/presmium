import type { Executor, RunRequest, RunResult } from '@presmium/kernel'
import { failedRun, isPython } from '../domain/index.ts'
import type { Trace, Tracer } from '../domain/index.ts'
import type { RunOutput, TraceOutput, WorkerReply, WorkerRequest } from './protocol.ts'

export interface PyodideExecutorOptions {
  /** Base URL of the Pyodide runtime files, ending with `/`. */
  indexURL: string
  /** Default timeout; counted from the start of execution, so loading the runtime is not included. */
  timeoutMs: number
  maxTraceEvents: number
}

export type PyodideExecutor = Executor & Tracer

type Outcome<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; error: string; timedOut: boolean; durationMs: number }

/**
 * Python in the browser (P-23): Pyodide runs in a worker, one request at a
 * time. A run that exceeds its timeout or is aborted terminates the worker;
 * the next request starts a fresh one.
 */
export function createPyodideExecutor(options: PyodideExecutorOptions): PyodideExecutor {
  const id = 'pyodide'
  let worker: Worker | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let ids = 0
  const traces = new Map<string, Promise<Trace>>()

  const spawn = () => (worker ??= new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module', name: 'presmium-pyodide' }))

  function send<T>(kind: WorkerRequest['kind'], request: RunRequest, signal?: AbortSignal): Promise<Outcome<T>> {
    const job = () => new Promise<Outcome<T>>((resolve) => {
      if (signal?.aborted) return resolve({ ok: false, error: '已取消', timedOut: false, durationMs: 0 })
      const target = spawn()
      const message: WorkerRequest = { id: ++ids, kind, request: plain(request), indexURL: options.indexURL, maxEvents: options.maxTraceEvents }
      let started = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const elapsed = () => (started ? Math.round(performance.now() - started) : 0)
      const finish = (outcome: Outcome<T>) => {
        clearTimeout(timer)
        target.removeEventListener('message', onMessage)
        target.removeEventListener('error', onError)
        signal?.removeEventListener('abort', onAbort)
        resolve(outcome)
      }
      const kill = (error: string, timedOut: boolean) => {
        target.terminate()
        if (worker === target) worker = undefined
        finish({ ok: false, error, timedOut, durationMs: elapsed() })
      }
      const onMessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.id !== message.id) return
        if (data.type === 'started') {
          started = performance.now()
          const timeoutMs = request.timeoutMs ?? options.timeoutMs
          timer = setTimeout(() => kill(`执行超过 ${timeoutMs} ms，已停止`, true), timeoutMs)
        } else if (data.type === 'done') {
          finish({ ok: true, value: data.value as T, durationMs: data.durationMs })
        } else {
          finish({ ok: false, error: data.error, timedOut: false, durationMs: elapsed() })
        }
      }
      const onError = (event: ErrorEvent) => kill(`Python 运行时出错：${event.message}`, false)
      const onAbort = () => kill('已取消', false)
      target.addEventListener('message', onMessage)
      target.addEventListener('error', onError)
      signal?.addEventListener('abort', onAbort)
      target.postMessage(message)
    })
    const outcome = queue.then(job)
    queue = outcome.catch(() => undefined)
    return outcome
  }

  return {
    id,
    supports: isPython,
    async run(request, signal): Promise<RunResult> {
      const outcome = await send<RunOutput>('run', request, signal)
      if (!outcome.ok) return { ...failedRun(id, outcome.error, outcome.durationMs), timedOut: outcome.timedOut }
      const { stdout, stderr, exitCode } = outcome.value
      return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: outcome.durationMs, timedOut: false, source: 'live', executorId: id }
    },
    trace(request, signal) {
      // Tracing is deterministic for the same input, so every view of a slide shares one trace.
      const key = JSON.stringify([request.code, request.args, request.stdin, request.files])
      let trace = traces.get(key)
      if (!trace) {
        trace = send<TraceOutput>('trace', request, signal).then(toTrace, (error: unknown) => ({ events: [], truncated: false, error: String(error) }))
        traces.set(key, trace)
        void trace.then(t => t.error !== undefined && traces.delete(key))
      }
      return trace
    },
  }
}

function toTrace(outcome: Outcome<TraceOutput>): Trace {
  if (!outcome.ok) return { events: [], truncated: false, error: outcome.error }
  const { events, truncated, output } = outcome.value
  // No line ran (e.g. a syntax error): the output explains why.
  return events.length ? { events, truncated } : { events, truncated, error: output || undefined }
}

/** Requests may hold reactive proxies, which cannot be posted to a worker. */
function plain(request: RunRequest): RunRequest {
  return JSON.parse(JSON.stringify(request)) as RunRequest
}
