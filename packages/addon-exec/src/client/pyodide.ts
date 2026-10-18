import { failedRun } from '@presmium/kernel'
import type { Executor, RunRequest, RunResult } from '@presmium/kernel'
import { isPython } from '../domain/index.ts'
import type { Trace, Tracer } from '../domain/index.ts'
import { messages } from './messages.ts'
import type { RunOutput, TraceOutput, WorkerReply, WorkerRequest } from './protocol.ts'

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
  const id = 'pyodide'
  let worker: Worker | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let ids = 0
  const traces = new Map<string, Promise<Trace>>()
  let cancel: (() => void) | undefined

  const spawn = () => (worker ??= new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module', name: 'presmium-pyodide' }))

  function send<T>(kind: WorkerRequest['kind'], request: RunRequest, signal?: AbortSignal): Promise<Outcome<T>> {
    const job = () => new Promise<Outcome<T>>((resolve) => {
      if (signal?.aborted) return resolve({ ok: false, error: messages().cancelled, timedOut: false, durationMs: 0 })
      const target = spawn()
      const indexURL = new URL(options.indexURL, location.href).href
      const message: WorkerRequest = { id: ++ids, kind, request: plain(request), indexURL, maxEvents: options.maxTraceEvents }
      let started = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const elapsed = () => (started ? Math.round(performance.now() - started) : 0)
      const finish = (outcome: Outcome<T>) => {
        clearTimeout(timer)
        cancel = undefined
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
          clearTimeout(timer)
          started = performance.now()
          const timeoutMs = request.timeoutMs ?? options.timeoutMs
          timer = setTimeout(() => kill(messages().runTimeout(timeoutMs), true), timeoutMs)
        } else if (data.type === 'done') {
          finish({ ok: true, value: data.value as T, durationMs: data.durationMs })
        } else {
          finish({ ok: false, error: data.error, timedOut: false, durationMs: elapsed() })
        }
      }
      const onError = (event: ErrorEvent) => kill(messages().runtimeCrashed('Python', event.message), false)
      const onAbort = () => kill(messages().cancelled, false)
      cancel = onAbort
      target.addEventListener('message', onMessage)
      target.addEventListener('error', onError)
      signal?.addEventListener('abort', onAbort)
      timer = setTimeout(() => kill(messages().loadTimeout('Python', options.loadTimeoutMs), true), options.loadTimeoutMs)
      target.postMessage(message)
    })
    const outcome = queue.then(job)
    queue = outcome.catch(() => undefined)
    return outcome
  }

  return {
    id,
    runsIn: 'browser',
    supports: isPython,
    async run(request, signal): Promise<RunResult> {
      const outcome = await send<RunOutput>('run', request, signal)
      if (!outcome.ok) return { ...failedRun(id, outcome.error, outcome.durationMs), timedOut: outcome.timedOut }
      const { stdout, stderr, exitCode, outputs } = outcome.value
      const unavailable = outputs?.find(output => output.output_type === 'error' && output.ename === 'GPUUnavailable')
      if (unavailable?.output_type === 'error') return { ...failedRun(id, messages().gpuUnavailable(unavailable.evalue), outcome.durationMs), stdout }
      return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: outcome.durationMs, timedOut: false, source: 'live', executorId: id, ...outputs ? { outputs } : {} }
    },
    async endSession(session) {
      if (worker) await send<null>('end', { lang: 'python', code: '', session })
    },
    dispose() {
      cancel?.()
      worker?.terminate()
      worker = undefined
      traces.clear()
      queue = Promise.resolve()
    },
    trace(request, signal) {
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
  return events.length ? { events, truncated } : { events, truncated, error: output || undefined }
}

function plain(request: RunRequest): RunRequest {
  return JSON.parse(JSON.stringify(request)) as RunRequest
}
