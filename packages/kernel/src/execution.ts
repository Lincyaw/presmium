/** Shared rules of code execution: language names and failed results. */
import type { RunResult } from './contracts.ts'

const ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
}

/**
 * The language a code block's `lang` names, as executors and renderers compare
 * it: lowercase, with the usual aliases resolved (`py`, `python3` and
 * `ipython*` are `python`; `js`, `mjs` are `javascript`; `ts` is `typescript`).
 */
export function languageId(lang: string): string {
  const id = lang.trim().toLowerCase()
  if (id.startsWith('ipython')) return 'python'
  return ALIASES[id] ?? id
}

/** The result of a run that could not happen (no runtime, an error before the program ran): `stderr` says why. */
export function failedRun(executorId: string, stderr: string, durationMs = 0): RunResult {
  return { ok: false, stdout: '', stderr, exitCode: null, durationMs, timedOut: false, source: 'live', executorId }
}
