import { isAbsolute, relative } from 'node:path'
import { diagnosticOf } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticOrigin, DiagnosticSnapshot, Finding, IRDocument, PreviewDiagnostics } from '@lincyaw/kernel'

export interface DiagnosticSource {
  document: string
  origin: DiagnosticOrigin
  renderer?: 'web' | 'slides'
  instance?: string
}

interface Contribution {
  source: DiagnosticSource
  diagnostics: Diagnostic[]
}

export function workspaceFindings(findings: Finding[], root: string): Finding[] {
  return findings.map(finding => ({
    ...finding,
    ...finding.source ? { source: { ...finding.source, file: (isAbsolute(finding.source.file) ? relative(root, finding.source.file) : finding.source.file).replace(/\\/g, '/') } } : {},
  }))
}

/** Each producer replaces its current contribution. No diagnostic event history is kept. */
export class DiagnosticStore {
  readonly #contributions = new Map<string, Contribution>()
  readonly #revisions = new Map<string, string | undefined>()
  readonly #watchers = new Set<(document: string) => void>()
  #version = 0

  observed(document: string): boolean {
    return this.#revisions.has(document)
  }

  revision(document: string): string | undefined {
    return this.#revisions.get(document)
  }

  snapshot(document?: string): DiagnosticSnapshot {
    const diagnostics = new Map<string, Diagnostic>()
    for (const contribution of this.#contributions.values()) {
      if (document !== undefined && contribution.source.document !== document) continue
      for (const diagnostic of contribution.diagnostics) diagnostics.set(diagnostic.id, diagnostic)
    }
    return {
      version: this.#version,
      diagnostics: [...diagnostics.values()].map(diagnostic => ({ ...diagnostic, ...diagnostic.source ? { source: { ...diagnostic.source } } : {} })),
    }
  }

  replace(source: DiagnosticSource, findings: Finding[], options: { revision?: string, root?: string } = {}): void {
    const key = JSON.stringify([source.document, source.origin, source.renderer, source.instance])
    const normalized = options.root ? workspaceFindings(findings, options.root) : findings
    const diagnostics = normalized.map(finding => diagnosticOf(source.document, source.origin, finding, source.renderer, options.revision))
    const previous = this.#contributions.get(key)
    if (JSON.stringify(previous?.diagnostics ?? []) === JSON.stringify(diagnostics)) return
    if (diagnostics.length) this.#contributions.set(key, { source, diagnostics })
    else this.#contributions.delete(key)
    this.#changed(source.document)
  }

  compiled(document: string, doc: IRDocument, root: string, revision?: string): void {
    if (!this.#revisions.has(document) || this.#revisions.get(document) !== revision) {
      this.#remove(document, source => source.origin === 'check' || source.origin === 'runtime')
    }
    this.#revisions.set(document, revision)
    this.replace({ document, origin: 'compile' }, doc.diagnostics, { root, revision })
  }

  failed(document: string, message: string, source?: Finding['source']): void {
    this.#revisions.set(document, undefined)
    this.#remove(document, contribution => contribution.origin === 'check' || contribution.origin === 'runtime')
    this.replace({ document, origin: 'compile' }, [{ checkId: 'presmium.compile', severity: 'error', message, ...source ? { source } : {} }])
  }

  report(report: PreviewDiagnostics): boolean {
    const source: DiagnosticSource = { document: report.document, origin: 'runtime', renderer: report.renderer, instance: report.instance }
    // A closing frame can always remove its own contribution, including after a new compile.
    if (!report.findings.length) {
      this.replace(source, [])
      return true
    }
    if (!this.#revisions.has(report.document) || this.#revisions.get(report.document) !== report.revision) return false
    this.replace(source, report.findings, { revision: report.revision })
    return true
  }

  forget(document: string): void {
    this.#revisions.delete(document)
    this.#remove(document, () => true)
  }

  clear(document: string, origin: DiagnosticOrigin, renderer?: 'web' | 'slides'): void {
    this.#remove(document, source => source.origin === origin && (renderer === undefined || source.renderer === renderer))
  }

  watch(listener: (document: string) => void): () => void {
    this.#watchers.add(listener)
    return () => { this.#watchers.delete(listener) }
  }

  events(document: string | undefined, signal: AbortSignal): AsyncIterable<{ event: string, data: DiagnosticSnapshot }> {
    let dirty = true
    let wake: (() => void) | undefined
    const store = this
    return {
      async* [Symbol.asyncIterator]() {
        const stop = store.watch(changed => {
          if (document !== undefined && document !== changed) return
          dirty = true
          wake?.()
        })
        const abort = () => wake?.()
        signal.addEventListener('abort', abort, { once: true })
        try {
          while (!signal.aborted) {
            if (dirty) {
              dirty = false
              yield { event: 'diagnostics', data: store.snapshot(document) }
            } else await new Promise<void>(resolve => wake = resolve)
          }
        } finally {
          stop()
          signal.removeEventListener('abort', abort)
        }
      },
    }
  }

  #remove(document: string, matches: (source: DiagnosticSource) => boolean): void {
    let changed = false
    for (const [key, contribution] of this.#contributions) {
      if (contribution.source.document !== document || !matches(contribution.source)) continue
      this.#contributions.delete(key)
      changed = true
    }
    if (changed) this.#changed(document)
  }

  #changed(document: string): void {
    this.#version++
    for (const watcher of this.#watchers) watcher(document)
  }
}
