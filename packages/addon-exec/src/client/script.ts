import { failedRun } from '@presmium/kernel'
import type { Executor, RunResult } from '@presmium/kernel'
import { isScript, isTypeScript } from '../domain/index.ts'
import type { ScriptOutput, ScriptRequest } from '../runner.mjs'
import { messages } from './messages.ts'

export const SCRIPT_EXECUTOR_ID = 'js-worker'

/**
 * JavaScript and TypeScript in the browser (P-20): each run gets a fresh
 * module worker, terminated when the run ends, times out or is aborted.
 * Parameters become constants; stdin and files are not available.
 */
export function createScriptExecutor(options: { timeoutMs: number }): Executor {
  const id = SCRIPT_EXECUTOR_ID
  return {
    id,
    supports: isScript,
    run(request, signal) {
      return new Promise<RunResult>((resolve) => {
        if (signal?.aborted) return resolve(failedRun(id, messages().cancelled))
        const worker = new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module', name: 'presmium-js' })
        const started = performance.now()
        const elapsed = () => Math.round(performance.now() - started)
        const timeoutMs = request.timeoutMs ?? options.timeoutMs
        const finish = (result: RunResult) => {
          clearTimeout(timer)
          worker.terminate()
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        }
        const onAbort = () => finish(failedRun(id, messages().cancelled, elapsed()))
        const timer = setTimeout(() => finish({ ...failedRun(id, messages().runTimeout(timeoutMs), elapsed()), timedOut: true }), timeoutMs)
        worker.onmessage = ({ data }: MessageEvent<ScriptOutput>) => finish({
          ok: data.exitCode === 0, ...data, durationMs: elapsed(), timedOut: false, source: 'live', executorId: id,
        })
        worker.onerror = event => finish(failedRun(id, messages().runtimeCrashed('JavaScript', event.message), elapsed()))
        signal?.addEventListener('abort', onAbort)
        const message: ScriptRequest = { code: request.code, args: { ...request.args }, typescript: isTypeScript(request.lang) }
        worker.postMessage(message)
      })
    },
  }
}
