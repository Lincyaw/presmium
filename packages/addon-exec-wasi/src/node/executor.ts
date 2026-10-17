/**
 * The compile-time executor of the WASI languages (K-19, P-103): each run is
 * a process of its own (./child.mjs) that runs the request in a worker thread
 * (./worker.mjs) with the runner the browser uses (../runner.mjs) on the same
 * binaries, read from the installed package, so the build machine needs no C
 * toolchain, Ruby or SQLite, and the recorded output is what a learner's run
 * gives. The process runs in the compiler's process sandbox when there is
 * one (`RunContext.sandbox`, as the Python and JavaScript runs do), else
 * directly (./process.ts): the program's memory is never the compiler's,
 * and the engine refuses to grow a WebAssembly memory past
 * `MEMORY_LIMIT_MB`, where the program's allocations fail (N-08). The
 * timeout counts once the runtime has loaded; an abort ends the process.
 *
 * The program's environment is the compiler's `RunContext.env` and nothing
 * else of this process's (docs/architecture.md 10.6); without a context, none.
 * The compiler and linker get no environment. The executor has no sessions:
 * every run is a program of its own.
 *
 * What a run records goes into the published forms, whatever the deck's
 * language, so the messages added here are English, like the tools' own.
 */
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { failedRun } from '@presmium/kernel'
import type { Executor, RunResult } from '@presmium/kernel'
import { DEFAULT_TIMEOUT_MS, MEMORY_LIMIT_MB } from '../domain/index.ts'
import type { WasiOutput } from '../runner.mjs'
import { runsLanguage } from '../runner.mjs'
import { localRun } from './process.ts'
import { runtimeDir, runtimeFingerprint } from './runtime.ts'

const CHILD = fileURLToPath(new URL('./child.mjs', import.meta.url))
/** Reading and compiling the runtime from the local disk takes a second at most; this bounds a stalled one. */
const LOAD_TIMEOUT_MS = 60_000
const REQUEST = '.presmium/request.json'
const RESULT = '.presmium/result-0.json'

/** What the run reads besides its directory: this package, the WASI system it imports, the runtime files and node. */
function readable(): string[] {
  const wasi = dirname(dirname(createRequire(import.meta.url).resolve('@runno/wasi')))
  return [fileURLToPath(new URL('../..', import.meta.url)), wasi, runtimeDir(), dirname(dirname(process.execPath))]
}

/** What ./child.mjs writes. */
interface ChildResult {
  durationMs: number
  output?: WasiOutput
  error?: string
  timedOut?: boolean
}

/** The executor `id`, running the WASI languages, or those of `languages` (a `kind: wasi` environment's). */
export function createWasiExecutor(id: string, languages?: string[]): Executor {
  return {
    id,
    supports: lang => runsLanguage(lang, languages),
    fingerprint: runtimeFingerprint,
    async run(request, signal, ctx): Promise<RunResult> {
      if (signal?.aborted) return failedRun(id, 'The run was cancelled')
      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const job = {
        request: { lang: request.lang, code: request.code, stdin: request.stdin, files: request.files, env: { ...ctx?.env } },
        dir: runtimeDir(),
        timeoutMs,
        loadTimeoutMs: LOAD_TIMEOUT_MS,
      }
      const sandbox = ctx?.sandbox ?? localRun
      let child
      try {
        // The process's own environment is empty: nothing of this process's reaches the run.
        child = await sandbox.run({ argv: [process.execPath, `--wasm-max-mem-pages=${MEMORY_LIMIT_MB * 16}`, CHILD], files: { [REQUEST]: JSON.stringify(job) }, collect: [RESULT], env: {}, read: readable(), timeoutMs: LOAD_TIMEOUT_MS + timeoutMs + 10_000, signal })
      } catch (error) {
        return failedRun(id, `the ${sandbox.kind} sandbox failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (signal?.aborted) return failedRun(id, 'The run was cancelled')
      let result: ChildResult | undefined
      try {
        result = child.files[RESULT] ? JSON.parse(Buffer.from(child.files[RESULT]).toString('utf8')) as ChildResult : undefined
      } catch {}
      if (!result) return failedRun(id, child.stderr.trim() || `The WASI runtime ended (${child.exitCode}) before the run did`)
      if (!result.output) return { ...failedRun(id, result.error ?? 'The WASI run failed', result.durationMs), ...result.timedOut ? { timedOut: true } : {} }
      const { stdout, stderr, exitCode, outputs } = result.output
      return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: result.durationMs, timedOut: false, source: 'live', executorId: id, outputs }
    },
  }
}
