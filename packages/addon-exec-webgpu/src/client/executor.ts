import { currentLocale } from '@lincyaw/host'
import { failedRun } from '@lincyaw/kernel'
import type { Executor, RunResult } from '@lincyaw/kernel'
import { computeRequest, isWgsl, MESSAGES, paramsSummary, programError, runResultOf } from '../domain/index.ts'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

const STOP_GRACE_MS = 200

export type WebgpuExecutor = Executor & {
  dispose(): void
}

export function createWebgpuExecutor(options: { id: string, timeoutMs: number }): WebgpuExecutor {
  const { id } = options
  const running = new Set<Worker>()
  return {
    id,
    runsIn: 'browser',
    supports: isWgsl,
    params(lang) {
      if (!isWgsl(lang)) return undefined
      const text = MESSAGES[currentLocale()]
      return { labels: text.labels, fields: ['buffers'], summary: args => paramsSummary(args, text) }
    },
    run(request, signal) {
      const text = MESSAGES[currentLocale()]
      const made = computeRequest(request.code, request.args, text)
      if ('error' in made) return Promise.resolve(programError(id, made.error, 0))
      return new Promise<RunResult>((resolve) => {
        if (signal?.aborted) return resolve(failedRun(id, text.cancelled))
        const worker = new Worker(new URL('./webgpu.worker.ts', import.meta.url), { type: 'module', name: 'presmium-webgpu' })
        running.add(worker)
        const started = performance.now()
        const elapsed = () => Math.round(performance.now() - started)
        const timeoutMs = request.timeoutMs ?? options.timeoutMs
        let settled = false
        const end = () => {
          running.delete(worker)
          worker.terminate()
        }
        const finish = (result: RunResult) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        }
        const stop = (result: RunResult) => {
          finish(result)
          worker.postMessage({ type: 'stop' } satisfies WorkerRequest)
          setTimeout(end, STOP_GRACE_MS)
        }
        const timer = setTimeout(() => stop({ ...failedRun(id, text.timedOut(timeoutMs), elapsed()), timedOut: true }), timeoutMs)
        const onAbort = () => stop(failedRun(id, text.cancelled, elapsed()))
        signal?.addEventListener('abort', onAbort)
        worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
          end()
          if (data.type === 'done') finish(runResultOf(id, data.outcome, elapsed(), text))
        }
        worker.onerror = (event) => {
          end()
          finish(failedRun(id, text.crashed(event.message), elapsed()))
        }
        worker.postMessage({ type: 'run', request: made.request } satisfies WorkerRequest)
      })
    },
    dispose() {
      running.forEach(worker => worker.terminate())
      running.clear()
    },
  }
}
