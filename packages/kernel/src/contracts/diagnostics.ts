import type { Finding } from './checks.ts'

export type DiagnosticOrigin = 'compile' | 'check' | 'preview' | 'runtime' | 'server'

/** A current problem. Source paths are relative to the workspace root. */
export interface Diagnostic extends Finding {
  id: string
  document: string
  origin: DiagnosticOrigin
  renderer?: 'web' | 'slides'
  revision?: string
}

/** Replaces the previous snapshot; it is not a history of diagnostic events. */
export interface DiagnosticSnapshot {
  version: number
  diagnostics: Diagnostic[]
}

/** The current problems reported by one embedded preview. */
export interface PreviewDiagnostics {
  document: string
  renderer: 'web' | 'slides'
  instance: string
  revision: string
  findings: Finding[]
}
