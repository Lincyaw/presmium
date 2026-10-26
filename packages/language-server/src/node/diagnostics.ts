import type { Finding, Severity, SourcePos } from '@lincyaw/kernel'
import { printParseErrorCode } from 'jsonc-parser'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticSeverity } from 'vscode-languageserver/node'
import type { Diagnostic, Range } from 'vscode-languageserver/node'
import { nodeAtPointer, readDocument } from '../domain/document.ts'

const SEVERITY: Record<Severity, DiagnosticSeverity> = { error: DiagnosticSeverity.Error, warning: DiagnosticSeverity.Warning, info: DiagnosticSeverity.Information }
export const offsetRange = (document: TextDocument, offset: number, length: number): Range => ({ start: document.positionAt(offset), end: document.positionAt(offset + Math.max(1, length)) })

/** The same syntax and graph validator used by source saves, before compilation is available. */
export function documentDiagnostics(text: string): Diagnostic[] {
  const document = TextDocument.create('', 'json', 0, text), source = readDocument(text)
  return [
    ...source.errors.map(error => ({ range: offsetRange(document, error.offset, error.length), severity: DiagnosticSeverity.Error, source: 'presmium', code: 'document.json', message: printParseErrorCode(error.error) })),
    ...(source.validation?.issues.map(issue => {
      const node = nodeAtPointer(source.tree!, issue.path)
      return { range: offsetRange(document, node.offset, node.length), severity: SEVERITY[issue.severity], source: 'presmium', code: issue.code, message: issue.message }
    }) ?? []),
  ]
}

/** Compiler JSON pointers resolve to real token ranges; project findings retain their code lines. */
export function diagnosticsByFile(findings: Finding[], entry: string, textOf: (file: string) => string): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>(), documents = new Map<string, TextDocument>()
  const trees = new Map<string, ReturnType<typeof readDocument>['tree']>()
  for (const finding of findings) {
    const source = finding.source as SourcePos | undefined, file = source?.file ?? entry
    let document = documents.get(file)
    if (!document) { document = TextDocument.create('', 'json', 0, textOf(file)); documents.set(file, document) }
    if (source?.pointer && !trees.has(file)) trees.set(file, readDocument(document.getText()).tree)
    const tree = trees.get(file)
    const node = tree && source?.pointer ? nodeAtPointer(tree, source.pointer) : undefined
    const line = Math.max(1, source?.line ?? 1) - 1, text = document.getText().split(/\r?\n/)[line] ?? ''
    const range = node ? offsetRange(document, node.offset, node.length) : { start: { line, character: text.length - text.trimStart().length }, end: { line, character: text.trimEnd().length } }
    const diagnostic: Diagnostic = { range, severity: SEVERITY[finding.severity], source: 'presmium', code: finding.checkId, message: finding.hint ? `${finding.message}\n${finding.hint}` : finding.message }
    byFile.set(file, [...byFile.get(file) ?? [], diagnostic])
  }
  return byFile
}
