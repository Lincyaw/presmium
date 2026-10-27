import { fnv1a64, speechEngineId } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentVoiceAuthoring, Finding, Member, SpeechService } from '@lincyaw/kernel'
import { validateDocumentVoiceCatalogQuery } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'

export interface DocumentVoiceServices { speech?: SpeechService, voiceover?: { version: 1, preview: true }, findings?: Finding[] }
export interface DocumentVoiceAuthoringOptions {
  editor: SourceEditor
  services(document: string, source: CanonicalSource): Promise<DocumentVoiceServices>
}
const same = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint

export function createDocumentVoiceAuthoring({ editor, services }: DocumentVoiceAuthoringOptions): { service: DocumentVoiceAuthoring, close(): Promise<void> } {
  const pending = new Set<{ controller: AbortController, finished: Promise<unknown> }>()
  let closed = false
  const current = (document: string, member: Member, expected?: CanonicalSource) => {
    const opened = readAuthoringDocument(editor, { document, member })
    const source = { documentId: opened.content.id, version: opened.source.version, fingerprint: fnv1a64(opened.source.content) }
    if (expected && !same(source, expected)) throw new RequestError(409, 'document-version-changed', { currentSource: source })
    return { source, lang: opened.content.metadata.lang }
  }
  const work = <T>(signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (closed) throw new RequestError(503, 'voice-authoring-closed')
    signal?.throwIfAborted()
    if (pending.size >= 4) throw new RequestError(503, 'voice-authoring-busy')
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const operation = { controller, finished: Promise.resolve() as Promise<unknown> }
    pending.add(operation)
    const finished = Promise.resolve().then(() => { combined.throwIfAborted(); return run(combined) }).finally(() => pending.delete(operation))
    operation.finished = finished
    return finished
  }
  const load = async (document: string, member: Member, signal: AbortSignal, expected?: CanonicalSource) => {
    const opened = current(document, member, expected), loaded = await services(document, opened.source)
    signal.throwIfAborted(); current(document, member, opened.source)
    return { ...opened, ...loaded }
  }
  const service: DocumentVoiceAuthoring = {
    capabilities: (document, member, signal) => work(signal, async signal => {
      const loaded = await load(document, member, signal)
      const [engines, defaultEngine] = await Promise.all([loaded.speech?.engines() ?? [], loaded.speech?.defaultSynthesisEngine?.()])
      signal.throwIfAborted(); current(document, member, loaded.source)
      const configured = engines.some(engine => engine.tts), unknown = !loaded.speech && loaded.findings?.some(finding => finding.severity === 'error')
      return { document, source: loaded.source, verification: 'configuration-only', status: configured ? 'configured' : unknown ? 'unknown' : 'unavailable', ...!configured ? { reason: unknown ? 'services-unavailable' : 'not-configured' } as const : {}, voiceover: loaded.voiceover?.version === 1, preview: loaded.voiceover?.preview === true, engines, ...defaultEngine ? { defaultEngine } : {}, ...loaded.findings?.length ? { findings: loaded.findings } : {} }
    }),
    catalog: (document, query, member, signal) => work(signal, async signal => {
      if (!validateDocumentVoiceCatalogQuery(query)) throw new RequestError(400, 'voice-catalog-query-invalid')
      const loaded = await load(document, member, signal, query.source)
      const engines = await loaded.speech?.engines() ?? []
      signal.throwIfAborted(); current(document, member, loaded.source)
      const preferred = query.engine ?? await loaded.speech?.defaultSynthesisEngine?.()
      signal.throwIfAborted(); current(document, member, loaded.source)
      const chosen = preferred ? engines.find(engine => engine.tts && engine.id === speechEngineId(preferred)) : undefined
      const unknown = !loaded.speech && loaded.findings?.some(finding => finding.severity === 'error')
      const catalog = chosen && loaded.speech ? await loaded.speech.voiceCatalog?.(chosen.id, query.lang ?? loaded.lang, signal) ?? { status: 'unavailable' as const, reason: 'unknown' as const, voices: [] } : { status: 'unavailable' as const, reason: unknown ? 'unknown' as const : 'not-configured' as const, voices: [] }
      signal.throwIfAborted(); current(document, member, loaded.source)
      return { document, source: loaded.source, engines, catalog, ...catalog.status === 'available' && chosen ? { engine: chosen.id } : {}, ...loaded.findings?.length ? { findings: loaded.findings } : {} }
    }),
  }
  return { service, async close() { closed = true; for (const operation of pending) operation.controller.abort(); await Promise.allSettled([...pending].map(operation => operation.finished)) } }
}
