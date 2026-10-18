import { currentLocale } from '@presmium/host'
import { failedRun } from '@presmium/kernel'
import type { Executor, RunResult } from '@presmium/kernel'
import { computeRequest, isWgsl, MESSAGES, paramsSummary, programError, runResult } from '../domain/index.ts'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

/** How long a stopped worker may take to destroy its device before it is ended anyway. */
const STOP_GRACE_MS = 200

export type WebgpuExecutor = Executor & {
  /** Ends the workers of runs under way. */
  dispose(): void
}

/**
 * WGSL compute shaders in the browser (P-104): each run gets a worker of its
 * own, which runs the shader on a device of its own. A run that exceeds its
 * timeout, or is cancelled, has the worker destroy the device and is ended
 * (a shader may keep the GPU busy); a lost device ends the run too. Where the
 * shader cannot run (no WebGPU, no adapter, a missing feature or limit, a lost
 * device, a timeout) the result is a run that did not happen (`exitCode`
 * null), and the recorded output shows with the reason; a shader WebGPU
 * rejects, or wrong `:params:`, is the program's own error. A run panel
 * names the parameters in the UI language, shows the buffers one field each
 * and its history a summary of them (`params`, D-10).
 */
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
        // The worker destroys the device, then it is ended.
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
          if (data.type === 'done') finish(runResult(id, data.outcome, elapsed(), text))
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
