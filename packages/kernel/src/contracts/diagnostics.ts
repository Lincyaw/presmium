import type { Finding } from './checks.ts'
import type { CanonicalSource } from '../ir.ts'

export type DiagnosticOrigin = 'compile' | 'check' | 'preview' | 'runtime' | 'server' | 'authoring'

/** A current problem. Source paths are relative to the workspace root. */
export interface Diagnostic extends Finding {
  id: string
  document: string
  origin: DiagnosticOrigin
  renderer?: 'web' | 'slides'
  revision?: string
  /** Saved authoring baseline when this issue was observed, never a compiled IR revision. */
  authoringSource?: CanonicalSource
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

/** A selected author's window can report a failure before any runtime has compiled. */
export interface AuthoringDiagnostics {
  document: string
  instance: string
  findings: { checkId: string, severity: 'error', message: string, authoringSource?: CanonicalSource }[]
}
