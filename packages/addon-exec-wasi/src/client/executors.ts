import { createResidentWorker } from '@lincyaw/host'
import { failedRun } from '@lincyaw/kernel'
import type { Executor, RunRequest, RunResult } from '@lincyaw/kernel'
import { DEFAULT_TIMEOUT_MS } from '../domain/index.ts'
import { runsLanguage } from '../shared/wasi-runner.mjs'
import { messages } from './messages.ts'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

export interface WasiExecutorsOptions {
  runtimeURL: string
  loadTimeoutMs: number
}

/** The page's WASI executors, which share one resident Worker: it compiles each runtime once. */
export interface WasiExecutors {
  executor(id: string, languages?: string[]): Executor
  dispose(): void
}

export function createWasiExecutors(options: WasiExecutorsOptions): WasiExecutors {
  const resident = createResidentWorker<WorkerRequest, WorkerReply>({
    start: () => new Worker(new URL('./wasi.worker.ts', import.meta.url), { type: 'module', name: 'presmium-wasi' }),
    loadTimeoutMs: options.loadTimeoutMs,
  })

  async function run(id: string, request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const outcome = await resident.send({
      request: { lang: request.lang, code: request.code, stdin: request.stdin, files: request.files ? { ...request.files } : undefined },
      runtimeURL: new URL(options.runtimeURL, location.href).href,
    }, { timeoutMs, signal })
    const t = messages()
    if ('failure' in outcome) {
      switch (outcome.failure) {
        case 'cancelled': return failedRun(id, t.cancelled, outcome.elapsedMs)
        case 'load-timeout': return { ...failedRun(id, t.loadTimeout(options.loadTimeoutMs)), timedOut: true }
        case 'run-timeout': return { ...failedRun(id, t.runTimeout(timeoutMs), outcome.elapsedMs), timedOut: true }
        case 'crashed': return failedRun(id, t.crashed(outcome.error ?? ''), outcome.elapsedMs)
      }
    }
    const { reply, elapsedMs } = outcome
    if (reply.type === 'error') return failedRun(id, reply.stage === 'load' ? t.loadFailed(reply.error) : t.crashed(reply.error), elapsedMs)
    const { stdout, stderr, exitCode, outputs } = reply.output
    return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: elapsedMs, timedOut: false, source: 'live', executorId: id, outputs }
  }

  return {
    executor: (id, languages) => ({
      id,
      runsIn: 'browser',
      supports: lang => runsLanguage(lang, languages),
      run: (request, signal) => run(id, request, signal),
    }),
    dispose: () => resident.dispose(),
  }
}
