import { isAbsolute, relative } from 'node:path'
import { diagnosticOf, fnv1a64, isRecord, pushStream } from '@lincyaw/kernel'
import type { AuthoringDiagnostics, Diagnostic, DiagnosticOrigin, DiagnosticSnapshot, Finding, IRDocument, PreviewDiagnostics } from '@lincyaw/kernel'

export interface DiagnosticSource {
  document: string
  origin: DiagnosticOrigin
  renderer?: 'web' | 'slides'
  instance?: string
}

interface Contribution {
  source: DiagnosticSource
  diagnostics: Diagnostic[]
  keep?: 'page'
}

/** Each page's content as the document lays it out, by section id: where its source sits in the file left out. */
function pageContents(doc: IRDocument): Map<string, string> {
  const located = (key: string, value: unknown) => key === 'source' && isRecord(value) && typeof value.file === 'string' ? undefined : value
  const shared = JSON.stringify([doc.meta, doc.config], located)
  return new Map(doc.sections.map(section => [section.id, fnv1a64(`${shared}\n${JSON.stringify(section, located)}`)]))
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
  readonly #irRevisions = new Map<string, string | undefined>()
  readonly #pages = new Map<string, Map<string, string>>()
  readonly #watchers = new Set<(document: string) => void>()
  #version = 0

  isObserved(document: string): boolean {
    return this.#irRevisions.has(document)
  }

  irRevision(document: string): string | undefined {
    return this.#irRevisions.get(document)
  }

  snapshot(document?: string): DiagnosticSnapshot {
    const diagnostics = new Map<string, Diagnostic>()
    for (const contribution of this.#contributions.values()) {
      if (document !== undefined && contribution.source.document !== document) continue
      for (const diagnostic of contribution.diagnostics) diagnostics.set(diagnostic.id, diagnostic)
    }
    return {
      version: this.#version,
      diagnostics: [...diagnostics.values()].map(diagnostic => ({ ...diagnostic, ...diagnostic.source ? { source: { ...diagnostic.source } } : {}, ...diagnostic.authoringSource ? { authoringSource: { ...diagnostic.authoringSource } } : {} })),
    }
  }

  replace(source: DiagnosticSource, findings: Finding[], options: { irRevision?: string, root?: string, keep?: 'page' } = {}): void {
    const key = JSON.stringify([source.document, source.origin, source.renderer, source.instance])
    const normalized = options.root ? workspaceFindings(findings, options.root) : findings
    const diagnostics = normalized.map(finding => diagnosticOf(source.document, source.origin, finding, source.renderer, options.irRevision))
    const previous = this.#contributions.get(key)
    if (JSON.stringify(previous?.diagnostics ?? []) === JSON.stringify(diagnostics) && previous?.keep === options.keep) return
    if (diagnostics.length) this.#contributions.set(key, { source, diagnostics, ...options.keep ? { keep: options.keep } : {} })
    else this.#contributions.delete(key)
    this.#changed(source.document)
  }

  compiled(document: string, doc: IRDocument, root: string, irRevision?: string): void {
    const pages = pageContents(doc)
    if (!this.#irRevisions.has(document) || this.#irRevisions.get(document) !== irRevision) {
      // Findings kept by page stay, at the new revision, for the pages whose content this compile left as it was.
      const before = this.#pages.get(document)
      for (const [key, contribution] of this.#contributions) {
        if (contribution.source.document !== document || contribution.source.origin !== 'runtime' || contribution.keep !== 'page') continue
        const kept = contribution.diagnostics.filter(diagnostic => diagnostic.section !== undefined && before?.get(diagnostic.section) !== undefined && before.get(diagnostic.section) === pages.get(diagnostic.section))
        if (kept.length) this.#contributions.set(key, { ...contribution, diagnostics: kept.map(diagnostic => ({ ...diagnostic, ...irRevision ? { revision: irRevision } : {} })) })
        else this.#contributions.delete(key)
        this.#changed(document)
      }
      this.#remove(document, source => source.origin === 'check' || (source.origin === 'runtime' && !this.#kept(source)))
    }
    this.#irRevisions.set(document, irRevision)
    this.#pages.set(document, pages)
    this.replace({ document, origin: 'compile' }, doc.diagnostics, { root, irRevision })
  }

  failed(document: string, message: string, source?: Finding['source']): void {
    this.#irRevisions.set(document, undefined)
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
    if (!this.#irRevisions.has(report.document) || this.#irRevisions.get(report.document) !== report.revision) return false
    this.replace(source, report.findings, { irRevision: report.revision, keep: report.keep })
    return true
  }

  /** This producer describes authoring-window failures, independently of runtime compilation. */
  reportAuthoring(report: AuthoringDiagnostics, member: string): void {
    this.replace({ document: report.document, origin: 'authoring', instance: JSON.stringify([member, report.instance]) }, report.findings)
  }

  forget(document: string): void {
    this.#irRevisions.delete(document)
    this.#pages.delete(document)
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
    const store = this
    return {
      async* [Symbol.asyncIterator]() {
        if (signal.aborted) return
        const changes = pushStream<void>(push => store.watch((changed) => {
          if (document === undefined || document === changed) push()
        }), { signal, latestOnly: true })
        try {
          yield { event: 'diagnostics', data: store.snapshot(document) }
          for await (const _change of changes) yield { event: 'diagnostics', data: store.snapshot(document) }
        } finally {
          changes.end()
        }
      },
    }
  }

  #kept(source: DiagnosticSource): boolean {
    return this.#contributions.get(JSON.stringify([source.document, source.origin, source.renderer, source.instance]))?.keep === 'page'
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
