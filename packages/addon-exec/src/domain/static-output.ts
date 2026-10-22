import type { RunResult } from '@lincyaw/kernel'
import { isPython, isScript } from './config.ts'
import { outputText } from './outputs.ts'

function literal(value: unknown, script: boolean): string {
  if (typeof value === 'boolean') return script ? String(value) : value ? 'True' : 'False'
  return typeof value === 'number' ? String(value) : JSON.stringify(String(value))
}

/** Assignments of a panel's parameters, put before its code where the code is shown without running it (fallback, notebook). */
export function paramsPrelude(lang: string, params: Record<string, unknown> | undefined): string {
  const script = isScript(lang)
  if (!script && !isPython(lang)) return ''
  return Object.entries(params ?? {}).map(([name, value]) => `${script ? 'const ' : ''}${name} = ${literal(value, script)}\n`).join('')
}

export function shownOutput(runs: readonly RunResult[], recorded: string | undefined): { text: string, recorded: boolean } {
  if (recorded !== undefined && !(runs.length > 0 && runs.every(run => run.ok))) return { text: recorded, recorded: true }
  return { text: runs.map(outputText).join(''), recorded: false }
}
