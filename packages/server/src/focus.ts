/**
 * The focus of each document (P-116, decision G-8, docs/design-dsh.md 8.6):
 * the workbench reports what the author points at (`POST
 * presmium.server/focus`, through the bundle's route with the service token);
 * the server resolves it on the document's compilation into source ranges and
 * excerpts read from the files, as `locate_source` finds them, and keeps the
 * latest of each document, as it keeps the windows' positions. MCP reads it
 * (`presmium://focus`, `get_focus`), and so does the bundle's document context.
 */
import { focusReport, resolveFocus } from '@presmium/mcp'
import type { McpFocus } from '@presmium/mcp'
import type { FocusReport, IRDocument } from '@presmium/kernel'

/** At most this many focuses in one report. */
const MAX_FOCUS = 50

export class FocusStore {
  readonly #latest = new Map<string, McpFocus>()
  readonly #watchers = new Set<() => void>()

  /** The latest focus of a document, or of any document; undefined when none was reported. */
  get(document?: string): McpFocus | undefined {
    if (document !== undefined) return this.#latest.get(document)
    let newest: McpFocus | undefined
    for (const found of this.#latest.values()) if (!newest || found.at >= newest.at) newest = found
    return newest
  }

  /** Resolves and keeps a document's report; throws with the reason when it is not one. */
  report(document: string, doc: IRDocument, reports: FocusReport[]): McpFocus {
    const record = { document, focus: reports.map(report => resolveFocus(doc, document, report)), at: Date.now() }
    this.#latest.set(document, record)
    for (const watcher of this.#watchers) watcher()
    return record
  }

  /** Forgets a document's focus (the document went away). */
  forget(document: string): void {
    if (this.#latest.delete(document)) for (const watcher of this.#watchers) watcher()
  }

  watch(listener: () => void): () => void {
    this.#watchers.add(listener)
    return () => this.#watchers.delete(listener)
  }
}

/** The reports of a request's body `{ document, focus: [...] }`, or why it is not one. */
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
