import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { failedRun } from '@lincyaw/kernel'
import type { Executor, RunResult } from '@lincyaw/kernel'
import { directSandbox, RUN_REQUEST_FILE, runResultFile } from '@lincyaw/kernel/node'
import { DEFAULT_TIMEOUT_MS, MEMORY_LIMIT_MB } from '../domain/index.ts'
import type { WasiOutput } from '../shared/wasi-runner.mjs'
import { runsLanguage } from '../shared/wasi-runner.mjs'
import { runtimeDir, runtimeFingerprint } from './runtime.ts'

const MAIN = fileURLToPath(new URL('./wasi-main.mjs', import.meta.url))
const LOAD_TIMEOUT_MS = 60_000
const RESULT = runResultFile(0)

function readable(): string[] {
  const wasi = dirname(dirname(createRequire(import.meta.url).resolve('@runno/wasi')))
  return [fileURLToPath(new URL('../..', import.meta.url)), wasi, runtimeDir(), dirname(dirname(process.execPath))]
}

interface WasiMainResult {
  durationMs: number
  output?: WasiOutput
  error?: string
  timedOut?: boolean
}

/** Runs WASI programs at compile time, each in a child process whose thread runs the runtime. */
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
      const sandbox = ctx?.sandbox ?? directSandbox
      let child
      try {
        child = await sandbox.run({ argv: [process.execPath, `--wasm-max-mem-pages=${MEMORY_LIMIT_MB * 16}`, MAIN, RUN_REQUEST_FILE, RESULT], files: { [RUN_REQUEST_FILE]: JSON.stringify(job) }, collect: [RESULT], env: {}, read: readable(), timeoutMs: LOAD_TIMEOUT_MS + timeoutMs + 10_000, signal })
      } catch (error) {
        return failedRun(id, `the ${sandbox.kind} sandbox failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (signal?.aborted) return failedRun(id, 'The run was cancelled')
      let result: WasiMainResult | undefined
      try {
        result = child.files[RESULT] ? JSON.parse(Buffer.from(child.files[RESULT]).toString('utf8')) as WasiMainResult : undefined
      } catch {}
      if (!result) return failedRun(id, child.stderr.trim() || `The WASI runtime ended (${child.exitCode}) before the run did`)
      if (!result.output) return { ...failedRun(id, result.error ?? 'The WASI run failed', result.durationMs), ...result.timedOut ? { timedOut: true } : {} }
      const { stdout, stderr, exitCode, outputs } = result.output
      return { ok: exitCode === 0, stdout, stderr, exitCode, durationMs: result.durationMs, timedOut: false, source: 'live', executorId: id, outputs }
    },
  }
}
