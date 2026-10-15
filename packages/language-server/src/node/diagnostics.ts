import type { Finding, Severity } from '@presmium/kernel'
import { DiagnosticSeverity } from 'vscode-languageserver/node'
import type { Diagnostic, Range } from 'vscode-languageserver/node'
import { fenceAt } from '../domain/index.ts'

const SEVERITY: Record<Severity, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
}

/**
 * Findings carry a file and a line. The range is the line's text, or the
 * directive argument when the message names it (e.g. a lost anchor).
 */
function rangeOf(text: string, line: number, message: string): Range {
  const fence = fenceAt([text], 0)
  const word = fence?.arg.split(/\s/)[0]
  if (fence && word && message.includes(word)) {
    return { start: { line, character: fence.argStart }, end: { line, character: fence.argStart + word.length } }
  }
  const start = text.length - text.trimStart().length
  return { start: { line, character: start }, end: { line, character: text.trimEnd().length } }
}

/** Diagnostics by absolute file path; `lines` gives the lines of a file. */
export function toDiagnostics(findings: Finding[], entry: string, lines: (file: string) => string[]): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>()
  const texts = new Map<string, string[]>()
  for (const finding of findings) {
    const file = finding.source?.file ?? entry
    const line = Math.max(1, finding.source?.line ?? 1) - 1
    if (!texts.has(file)) texts.set(file, lines(file))
    const diagnostic: Diagnostic = {
      range: rangeOf(texts.get(file)![line] ?? '', line, finding.message),
      severity: SEVERITY[finding.severity],
      source: 'presmium',
      code: finding.checkId,
      message: finding.hint ? `${finding.message}\n${finding.hint}` : finding.message,
    }
    byFile.set(file, [...byFile.get(file) ?? [], diagnostic])
  }
  return byFile
}
