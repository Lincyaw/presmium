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
const LOAD_TIMEOUT_MS = 60_000
const REQUEST = '.presmium/request.json'
const RESULT = '.presmium/result-0.json'

function readable(): string[] {
  const wasi = dirname(dirname(createRequire(import.meta.url).resolve('@runno/wasi')))
  return [fileURLToPath(new URL('../..', import.meta.url)), wasi, runtimeDir(), dirname(dirname(process.execPath))]
}

interface ChildResult {
  durationMs: number
  output?: WasiOutput
  error?: string
  timedOut?: boolean
}

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
