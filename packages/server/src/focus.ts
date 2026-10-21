import { focusReport, resolveFocus } from '@lincyaw/mcp'
import type { McpFocus } from '@lincyaw/mcp'
import type { FocusReport, IRDocument } from '@lincyaw/kernel'

const MAX_FOCUS = 50

export class FocusStore {
  readonly #latest = new Map<string, McpFocus>()
  readonly #watchers = new Set<() => void>()

  get(document?: string): McpFocus | undefined {
    if (document !== undefined) return this.#latest.get(document)
    let newest: McpFocus | undefined
    for (const found of this.#latest.values()) if (!newest || found.at >= newest.at) newest = found
    return newest
  }

  report(document: string, doc: IRDocument | undefined, reports: FocusReport[], readWorkspace?: (file: string) => string): McpFocus {
    const record = { document, focus: reports.map(report => resolveFocus(doc, document, report, undefined, readWorkspace)), at: Date.now() }
    this.#latest.set(document, record)
    for (const watcher of this.#watchers) watcher()
    return record
  }

  forget(document: string): void {
    if (this.#latest.delete(document)) for (const watcher of this.#watchers) watcher()
  }

  watch(listener: () => void): () => void {
    this.#watchers.add(listener)
    return () => this.#watchers.delete(listener)
  }
}

export function focusBody(body: unknown): { document: string, focus: FocusReport[] } | string {
  if (!body || typeof body !== 'object') return 'a JSON object { document, focus: [...] }'
  const { document, focus } = body as { document?: unknown, focus?: unknown }
  if (typeof document !== 'string') return 'the document directory (relative to the workspace root) as `document`'
  if (!Array.isArray(focus) || focus.length > MAX_FOCUS) return `focus is a list of at most ${MAX_FOCUS}`
  const reports: FocusReport[] = []
  for (const item of focus) {
    const report = focusReport(item)
    if (typeof report === 'string') return report
    reports.push(report)
  }
  return { document, focus: reports }
}
