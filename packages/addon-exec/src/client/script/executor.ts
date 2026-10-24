import { siteBase } from '@lincyaw/host'
import { failedRun } from '@lincyaw/kernel'
import type { Executor, RunResult } from '@lincyaw/kernel'
import { isScript, isTypeScript, SCRIPT_IMPORTS } from '../../domain/index.ts'
import type { ScriptOutput, ScriptRequest } from '../../shared/script-runner.mjs'
import { messages } from '../messages.ts'

export const BROWSER_SCRIPT_EXECUTOR_ID = 'js-worker'

export type ScriptExecutor = Executor & { dispose(): void }

function imports(): Record<string, string> {
  return Object.fromEntries(Object.entries(SCRIPT_IMPORTS).map(([name, path]) => [name, new URL(`${siteBase()}${path}`, location.href).href]))
}

export function createScriptExecutor(options: { timeoutMs: number }): ScriptExecutor {
  const id = BROWSER_SCRIPT_EXECUTOR_ID
  const active = new Set<() => void>()
  let disposed = false
  return {
    id,
    runsIn: 'browser',
    supports: isScript,
    run(request, signal) {
      return new Promise<RunResult>((resolve) => {
        if (disposed || signal?.aborted) return resolve(failedRun(id, messages().cancelled))
        const worker = new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module', name: 'presmium-js' })
        const started = performance.now()
        const elapsed = () => Math.round(performance.now() - started)
        const timeoutMs = request.timeoutMs ?? options.timeoutMs
        let finished = false
        const finish = (result: RunResult) => {
          if (finished) return
          finished = true
          active.delete(onAbort)
          clearTimeout(timer)
          worker.onmessage = null
          worker.onerror = null
          worker.terminate()
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        }
        const onAbort = () => finish(failedRun(id, messages().cancelled, elapsed()))
        const timer = setTimeout(() => finish({ ...failedRun(id, messages().runTimeout(timeoutMs), elapsed()), timedOut: true }), timeoutMs)
        active.add(onAbort)
        worker.onmessage = ({ data }: MessageEvent<ScriptOutput>) => finish({
          ok: data.exitCode === 0, ...data, durationMs: elapsed(), timedOut: false, source: 'live', executorId: id,
        })
        worker.onerror = event => finish(failedRun(id, messages().runtimeCrashed('JavaScript', event.message), elapsed()))
        signal?.addEventListener('abort', onAbort)
        const message: ScriptRequest = { code: request.code, args: { ...request.args }, typescript: isTypeScript(request.lang), imports: imports() }
        worker.postMessage(message)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const cancel of [...active]) cancel()
      active.clear()
    },
  }
}
