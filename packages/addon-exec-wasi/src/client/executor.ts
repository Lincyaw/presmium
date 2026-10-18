import { failedRun } from '@presmium/kernel'
import type { Executor, RunRequest, RunResult } from '@presmium/kernel'
import { DEFAULT_TIMEOUT_MS } from '../domain/index.ts'
import { runsLanguage } from '../runner.mjs'
import { messages } from './messages.ts'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

export interface WasiRunnerOptions {
  runtimeURL: string
  loadTimeoutMs: number
}

export interface WasiRunner {
  executor(id: string, languages?: string[]): Executor
  dispose(): void
}

export function createWasiRunner(options: WasiRunnerOptions): WasiRunner {
  let worker: Worker | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let ids = 0
  let cancel: (() => void) | undefined

  const spawn = () => (worker ??= new Worker(new URL('./wasi.worker.ts', import.meta.url), { type: 'module', name: 'presmium-wasi' }))

  function send(id: string, request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    const job = () => new Promise<RunResult>((resolve) => {
      if (signal?.aborted) return resolve(failedRun(id, messages().cancelled))
      const target = spawn()
      const message: WorkerRequest = {
        id: ++ids,
        request: { lang: request.lang, code: request.code, stdin: request.stdin, files: request.files ? { ...request.files } : undefined },
        runtimeURL: new URL(options.runtimeURL, location.href).href,
      }
      let started = 0
      const elapsed = () => (started ? Math.round(performance.now() - started) : 0)
      const finish = (result: RunResult) => {
        clearTimeout(timer)
        cancel = undefined
        target.removeEventListener('message', onMessage)
        target.removeEventListener('error', onError)
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const kill = (result: RunResult) => {
        target.terminate()
        if (worker === target) worker = undefined
        finish(result)
      }
      const onMessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.id !== message.id) return
        if (data.type === 'started') {
          clearTimeout(timer)
          started = performance.now()
          const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
          timer = setTimeout(() => kill({ ...failedRun(id, messages().runTimeout(timeoutMs), elapsed()), timedOut: true }), timeoutMs)
        } else if (data.type === 'done') {
          const { stdout, stderr, exitCode, outputs } = data.output
          finish({ ok: exitCode === 0, stdout, stderr, exitCode, durationMs: elapsed(), timedOut: false, source: 'live', executorId: id, outputs })
        } else {
          finish(failedRun(id, data.stage === 'load' ? messages().loadFailed(data.error) : messages().crashed(data.error), elapsed()))
        }
      }
      const onError = (event: ErrorEvent) => kill(failedRun(id, messages().crashed(event.message), elapsed()))
      const onAbort = () => kill(failedRun(id, messages().cancelled, elapsed()))
      cancel = onAbort
      target.addEventListener('message', onMessage)
      target.addEventListener('error', onError)
      signal?.addEventListener('abort', onAbort)
      let timer = setTimeout(() => kill({ ...failedRun(id, messages().loadTimeout(options.loadTimeoutMs)), timedOut: true }), options.loadTimeoutMs)
      target.postMessage(message)
    })
    const outcome = queue.then(job)
    queue = outcome.catch(() => undefined)
    return outcome
  }

  return {
    executor: (id, languages) => ({
      id,
      runsIn: 'browser',
      supports: lang => runsLanguage(lang, languages),
      run: (request, signal) => send(id, request, signal),
    }),
    dispose() {
      cancel?.()
      worker?.terminate()
      worker = undefined
      queue = Promise.resolve()
    },
  }
}
