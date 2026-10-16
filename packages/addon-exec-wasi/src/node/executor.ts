/**
 * The compile-time executor of the WASI languages (K-19, P-103): each run is
 * a worker thread (./worker.mjs) that runs the request with the runner the
 * browser uses (../runner.mjs) on the same binaries, read from the installed
 * package, so the build machine needs no C toolchain, Ruby or SQLite, and
 * the recorded output is what a learner's run gives. The thread is ended at
 * the run's timeout, counted once the runtime has loaded, or on abort.
 *
 * The program's environment is the compiler's `RunContext.env` and nothing
 * else of this process's (docs/architecture.md 10.6); without a context, none.
 * The compiler and linker get no environment. Runs need no process sandbox:
 * the code runs in WebAssembly, with the WASI system's in-memory file system.
 * The executor has no sessions: every run is a program of its own.
 *
 * What a run records goes into the published forms, whatever the deck's
 * language, so the messages added here are English, like the tools' own.
 */
import { Worker } from 'node:worker_threads'
import { failedRun } from '@presmium/kernel'
import type { Executor, RunResult } from '@presmium/kernel'
import { DEFAULT_TIMEOUT_MS } from '../domain/index.ts'
import type { WasiOutput, WasiRequest } from '../runner.mjs'
import { runsLanguage } from '../runner.mjs'
import { runtimeDir, runtimeFingerprint } from './runtime.ts'

const WORKER = new URL('./worker.mjs', import.meta.url)
/** Reading and compiling the runtime from the local disk takes a second at most; this bounds a stalled one. */
const LOAD_TIMEOUT_MS = 60_000

type Reply = { type: 'started' } | { type: 'done', output: WasiOutput } | { type: 'error', error: string }

/** The executor `id`, running the WASI languages, or those of `languages` (a `kind: wasi` environment's). */
export function createWasiExecutor(id: string, languages?: string[]): Executor {
  return {
    id,
    supports: lang => runsLanguage(lang, languages),
    fingerprint: runtimeFingerprint,
    run(request, signal, ctx) {
      return new Promise<RunResult>((resolve) => {
        if (signal?.aborted) return resolve(failedRun(id, 'The run was cancelled'))
        const job: WasiRequest = { lang: request.lang, code: request.code, stdin: request.stdin, files: request.files, env: { ...ctx?.env } }
        // The thread's own environment is empty too: nothing of this process's reaches the run.
        const worker = new Worker(WORKER, { workerData: { request: job, dir: runtimeDir() }, env: {} })
        const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
        let started = 0
        const elapsed = () => (started ? Math.round(performance.now() - started) : 0)
        const finish = (result: RunResult) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
          worker.removeAllListeners()
          void worker.terminate()
          resolve(result)
        }
        const onAbort = () => finish(failedRun(id, 'The run was cancelled', elapsed()))
        let timer = setTimeout(() => finish(failedRun(id, `The WASI runtime did not load within ${LOAD_TIMEOUT_MS} ms`)), LOAD_TIMEOUT_MS)
        worker.on('message', (reply: Reply) => {
          if (reply.type === 'started') {
            clearTimeout(timer)
            started = performance.now()
            timer = setTimeout(() => finish({ ...failedRun(id, `Stopped after ${timeoutMs} ms`, elapsed()), timedOut: true }), timeoutMs)
          } else if (reply.type === 'done') {
            const { stdout, stderr, exitCode, outputs } = reply.output
            finish({ ok: exitCode === 0, stdout, stderr, exitCode, durationMs: elapsed(), timedOut: false, source: 'live', executorId: id, outputs })
          } else {
            finish(failedRun(id, `The WASI runtime failed: ${reply.error}`, elapsed()))
          }
        })
        worker.on('error', error => finish(failedRun(id, `The WASI runtime failed: ${error.message}`, elapsed())))
        worker.on('exit', code => finish(failedRun(id, `The WASI runtime ended (${code}) before the run did`, elapsed())))
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
  }
}
