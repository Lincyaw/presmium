import type { RunResult } from '@lincyaw/kernel'
import { isPython, isScript } from './config.ts'

function literal(value: unknown, script: boolean): string {
  if (typeof value === 'boolean') return script ? String(value) : value ? 'True' : 'False'
  return typeof value === 'number' ? String(value) : JSON.stringify(String(value))
}

export function declarations(lang: string, params: Record<string, unknown> | undefined): string {
  const script = isScript(lang)
  if (!script && !isPython(lang)) return ''
  return Object.entries(params ?? {}).map(([name, value]) => `${script ? 'const ' : ''}${name} = ${literal(value, script)}\n`).join('')
}

export function shownOutput(runs: readonly RunResult[], recorded: string | undefined): { text: string, recorded: boolean } {
  if (recorded !== undefined && !(runs.length > 0 && runs.every(run => run.ok))) return { text: recorded, recorded: true }
  return { text: runs.map(run => run.stdout + run.stderr).join(''), recorded: false }
}
