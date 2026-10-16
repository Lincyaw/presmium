/**
 * What a run panel shows where it cannot run (P-24, P-75, K-12): its code
 * with the parameters given their values first, and the output recorded at
 * compile time, or its `recorded` output where that run failed, timed out or
 * did not happen. The notebook extension and the panel's fallback (PDF and
 * PNG exports) both write it.
 */
import type { RunResult } from '@presmium/kernel'
import { isPython, isScript } from './config.ts'

/** A parameter value as a literal of the code's language: JavaScript for script languages, else Python. */
function literal(value: unknown, script: boolean): string {
  if (typeof value === 'boolean') return script ? String(value) : value ? 'True' : 'False'
  return typeof value === 'number' ? String(value) : JSON.stringify(String(value))
}

/**
 * Lines that give the parameters their values before the code: `n = 3` in
 * Python, `const n = 3` in JavaScript and TypeScript; none in other
 * languages, whose runners receive them otherwise.
 */
export function declarations(lang: string, params: Record<string, unknown> | undefined): string {
  const script = isScript(lang)
  if (!script && !isPython(lang)) return ''
  return Object.entries(params ?? {}).map(([name, value]) => `${script ? 'const ' : ''}${name} = ${literal(value, script)}\n`).join('')
}

/**
 * The output to show for runs recorded at compile time: the panel's
 * `recorded` output when none ran or one failed or timed out (and the panel
 * has one), else what the runs printed.
 */
export function shownOutput(runs: readonly RunResult[], recorded: string | undefined): { text: string, recorded: boolean } {
  if (recorded !== undefined && !(runs.length > 0 && runs.every(run => run.ok))) return { text: recorded, recorded: true }
  return { text: runs.map(run => run.stdout + run.stderr).join(''), recorded: false }
}
