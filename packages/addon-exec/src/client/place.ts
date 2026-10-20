import { environmentExecutor } from '@lincyaw/kernel'
import type { EnvironmentSpec, Executor } from '@lincyaw/kernel'
import { shallowRef } from 'vue'

export type RunPlace =
  | { kind: 'browser' }
  | { kind: 'machine' }
  | { kind: 'remote', name: string }
  | { kind: 'environment', name: string }

export const environments = shallowRef<Readonly<Record<string, EnvironmentSpec>>>({})

const KINDS: Record<string, RunPlace['kind']> = { wasi: 'browser', webgpu: 'browser', devcontainer: 'machine', jupyter: 'remote' }

export function runPlace(executorId: string | undefined, executor?: Executor): RunPlace | undefined {
  if (!executorId) return undefined
  const prefix = environmentExecutor('')
  if (executorId.startsWith(prefix)) {
    const name = executorId.slice(prefix.length)
    const kind = executor?.runsIn ?? KINDS[environments.value[name]?.kind ?? ''] ?? 'environment'
    return kind === 'browser' || kind === 'machine' ? { kind } : { kind, name }
  }
  return executor?.runsIn ? { kind: executor.runsIn } : undefined
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

export function languageName(lang: string): string {
  return NAMES[lang.toLowerCase()] ?? lang
}

export function seconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? s.toFixed(2) : s < 100 ? s.toFixed(1) : String(Math.round(s))
}
