import type { Diagnostic, DiagnosticOrigin, Finding } from './contracts.ts'
import { fnv1a64 } from './fingerprint.ts'

export function diagnosticOf(document: string, origin: DiagnosticOrigin, finding: Finding, renderer?: 'web' | 'slides', revision?: string): Diagnostic {
  const id = fnv1a64(JSON.stringify([document, origin, renderer, finding.checkId, finding.severity, finding.message, finding.source?.file, finding.source?.line, finding.hint]))
  return { ...finding, ...finding.source ? { source: { ...finding.source } } : {}, id, document, origin, ...renderer ? { renderer } : {}, ...revision ? { revision } : {} }
}
