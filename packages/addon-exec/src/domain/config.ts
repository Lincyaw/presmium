import { languageId } from '@lincyaw/kernel'

export const EXEC_ID = 'presmium.exec'

export interface ExecConfig {
  timeoutMs: number
  loadTimeoutMs: number
  maxTraceEvents: number
  pyodideURL?: string
}

export const DEFAULT_EXEC_CONFIG: ExecConfig = { timeoutMs: 10_000, loadTimeoutMs: 30_000, maxTraceEvents: 500 }

const positive = (value: unknown, fallback: number) => (typeof value === 'number' && value > 0 ? value : fallback)

export function execConfig(raw: Record<string, unknown>): ExecConfig {
  return {
    timeoutMs: positive(raw.timeoutMs, DEFAULT_EXEC_CONFIG.timeoutMs),
    loadTimeoutMs: positive(raw.loadTimeoutMs, DEFAULT_EXEC_CONFIG.loadTimeoutMs),
    maxTraceEvents: positive(raw.maxTraceEvents, DEFAULT_EXEC_CONFIG.maxTraceEvents),
    pyodideURL: typeof raw.pyodideURL === 'string' && raw.pyodideURL ? raw.pyodideURL : undefined,
  }
}

export function configuredTimeout(raw: Record<string, unknown>): number | undefined {
  return typeof raw.timeoutMs === 'number' && raw.timeoutMs > 0 ? raw.timeoutMs : undefined
}

export function isPython(lang: string): boolean {
  return languageId(lang) === 'python'
}

export function isScript(lang: string): boolean {
  return ['javascript', 'typescript'].includes(languageId(lang))
}

export const SCRIPT_IMPORTS: Readonly<Record<string, string>> = { '@jax-js/jax': 'presmium/jax-js/index.js' }

export function isTypeScript(lang: string): boolean {
  return languageId(lang) === 'typescript'
}
