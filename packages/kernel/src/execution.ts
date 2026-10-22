import type { RunResult } from './contracts/execution.ts'

const ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
}

export function languageId(lang: string): string {
  const id = lang.trim().toLowerCase()
  if (id.startsWith('ipython')) return 'python'
  return ALIASES[id] ?? id
}

export function failedRun(executorId: string, stderr: string, durationMs = 0): RunResult {
  return { ok: false, stdout: '', stderr, exitCode: null, durationMs, timedOut: false, source: 'live', executorId }
}

export const CREDENTIAL_VARIABLE = /_(?:KEY|TOKEN|SECRET|PASSWORD|APPID)$/i

export function environmentExecutor(name: string): string {
  return `presmium.env.${name}`
}
