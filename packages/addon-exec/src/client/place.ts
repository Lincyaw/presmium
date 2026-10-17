/**
 * What a run panel's bar says of its code (N-10, docs/design/slide.dc.html:
 * "Python · 浏览器中运行"): the language's name, and where the executor that
 * runs it runs code. The executors of Presmium's own plugins are known by
 * their ids (an executor says nothing of where it runs, `Executor` in
 * @presmium/kernel); a named environment (`:env:`, docs/ir.md 2.7) by the
 * `kind` the deck declares for it. Another executor's place is not said.
 */
import { environmentExecutor } from '@presmium/kernel'
import type { EnvironmentSpec } from '@presmium/kernel'
import { shallowRef } from 'vue'
import { SCRIPT_EXECUTOR_ID } from './script.ts'

/** Where code runs: in the page, on the machine of the server (`presmium dev`, `presmium serve`), in a remote environment, or in a named environment of another kind. */
export type RunPlace =
  | { kind: 'browser' }
  | { kind: 'machine' }
  | { kind: 'remote', name: string }
  | { kind: 'environment', name: string }

/** The deck's named environments (`execute.environments`), as the kernel gave them to this plugin. */
export const environments = shallowRef<Readonly<Record<string, EnvironmentSpec>>>({})

/** Executors that run code in the page: Pyodide and the script worker (this plugin's), the WASI and WebGPU plugins'. */
const IN_BROWSER = new Set(['pyodide', SCRIPT_EXECUTOR_ID, 'presmium.wasi', 'presmium.webgpu'])
/** The local plugin's executor: the server runs the code on its machine. */
const ON_MACHINE = new Set(['presmium.container'])
/** Environment kinds by where they run code. */
const KINDS: Record<string, RunPlace['kind']> = { wasi: 'browser', webgpu: 'browser', devcontainer: 'machine', jupyter: 'remote' }

export function runPlace(executorId: string | undefined): RunPlace | undefined {
  if (!executorId) return undefined
  const prefix = environmentExecutor('')
  if (executorId.startsWith(prefix)) {
    const name = executorId.slice(prefix.length)
    const kind = KINDS[environments.value[name]?.kind ?? ''] ?? 'environment'
    return kind === 'browser' || kind === 'machine' ? { kind } : { kind, name }
  }
  if (IN_BROWSER.has(executorId)) return { kind: 'browser' }
  if (ON_MACHINE.has(executorId)) return { kind: 'machine' }
  return undefined
}

const NAMES: Record<string, string> = {
  'python': 'Python',
  'py': 'Python',
  'python3': 'Python',
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'wgsl': 'WGSL',
  'c': 'C',
  'cpp': 'C++',
  'c++': 'C++',
  'ruby': 'Ruby',
  'rb': 'Ruby',
  'sql': 'SQL',
  'r': 'R',
  'julia': 'Julia',
  'bash': 'Bash',
  'sh': 'Shell',
  'shell': 'Shell',
}

/** A language's name as people write it: `python` is Python. */
export function languageName(lang: string): string {
  return NAMES[lang.toLowerCase()] ?? lang
}

/** A run's duration in seconds, as the output's label gives it: two decimals under 10 s, one under 100 s. */
export function seconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? s.toFixed(2) : s < 100 ? s.toFixed(1) : String(Math.round(s))
}
