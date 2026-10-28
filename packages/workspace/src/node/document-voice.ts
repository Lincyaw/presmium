import { DOCUMENT_ENTRY, fnv1a64, hasRole, speechEngineId } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentVoiceAuthoring, Finding, Member, SpeechService, VoiceoverExecution, VoiceoverJob } from '@lincyaw/kernel'
import { createVoiceoverOwner, createVoiceoverRoutes, validateDocumentVoiceCatalogQuery, validateVoicePreviewStart } from '@lincyaw/kernel/node'
import { readAuthoringDocument } from './document-editor.ts'
import { RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'

export interface DocumentVoiceServices { speech?: SpeechService, voiceover?: { version: 1, preview: true }, voiceoverExecution?: VoiceoverExecution, findings?: Finding[] }
export interface DocumentVoiceAuthoringOptions {
  editor: SourceEditor
  services(document: string, source: CanonicalSource): Promise<DocumentVoiceServices>
  revision?(document: string): string | undefined
}
const same = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint

export function createDocumentVoiceAuthoring({ editor, services, revision }: DocumentVoiceAuthoringOptions) {
  const pending = new Set<{ controller: AbortController, finished: Promise<unknown> }>()
  const owners = new Map<string, ReturnType<typeof createVoiceoverOwner>>()
  let closed = false
  const authorize = (document: string, member: Member) => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'voice-authoring-permission-denied')
    if (closed) throw new RequestError(503, 'voice-authoring-closed')
    if (!owners.has(document)) editor.readableFile({ document, home: false }, document ? `${document}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY, member)
  }
  const ownerOf = (document: string, member: Member) => {
    authorize(document, member)
    let owner = owners.get(document)
    if (!owner) { owner = createVoiceoverOwner(); owners.set(document, owner) }
    return owner
  }
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
    authorize(document, member)
    const opened = current(document, member, expected), loaded = await services(document, opened.source)
    signal.throwIfAborted(); current(document, member, opened.source)
    return { ...opened, ...loaded }
  }
  const execution = (document: string, member: Member) => async (expected: CanonicalSource | undefined, signal: AbortSignal) => {
    const loaded = await load(document, member, signal, expected)
    if (!loaded.voiceoverExecution) throw new RequestError(503, 'voiceover-unavailable')
    return loaded.voiceoverExecution
  }
  const isCurrent = (document: string, member: Member, job: VoiceoverJob): boolean | 'unknown' => {
    try { const actual = current(document, member).source; if (!same(actual, job.source)) return false; const known = revision?.(document); return known === undefined ? 'unknown' : known === job.revision }
    catch { return 'unknown' }
  }
  const service: DocumentVoiceAuthoring = {
    capabilities: (document, member, signal) => work(signal, async signal => {
      const loaded = await load(document, member, signal)
      const [engines, defaultEngine] = await Promise.all([loaded.speech?.engines() ?? [], loaded.speech?.defaultSynthesisEngine?.()])
      signal.throwIfAborted(); current(document, member, loaded.source)
      const configured = engines.some(engine => engine.tts), unknown = !loaded.speech && loaded.findings?.some(finding => finding.severity === 'error')
      const implemented = Boolean(loaded.voiceoverExecution)
      return { document, source: loaded.source, verification: 'configuration-only', status: configured ? 'configured' : unknown ? 'unknown' : 'unavailable', ...!configured ? { reason: unknown ? 'services-unavailable' : 'not-configured' } as const : {}, voiceover: implemented, preview: implemented, engines, ...defaultEngine ? { defaultEngine } : {}, ...loaded.findings?.length ? { findings: loaded.findings } : {}, actions: { status: implemented, list: true, get: true, start: implemented && configured, cancel: true, quotePreview: implemented, preview: implemented && configured, readPreview: true }, tasks: { idempotency: 'process', limits: ownerOf(document, member).limits } }
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
    snapshot: (document, query, member, signal) => ownerOf(document, member).snapshot(query, execution(document, member), signal),
    listJobs: async (document, member) => {
      const owner = ownerOf(document, member)
      return { document, jobs: owner.list().map(job => ({ ...job, current: isCurrent(document, member, job) })), idempotency: 'process', limits: owner.limits }
    },
    getJob: async (document, query, member) => {
      const value = ownerOf(document, member).get(query)
      return { ...value, current: value.job ? isCurrent(document, member, value.job) : 'unknown' }
    },
    start: (document, request, member, signal) => ownerOf(document, member).start(request, execution(document, member), signal),
    checkStart: (document, request, member, signal) => ownerOf(document, member).checkStart(request, execution(document, member), signal),
    checkCancel: async (document, query, member) => ownerOf(document, member).checkCancel(query),
    checkPreview: async (document, request, member, signal) => {
      if (!validateVoicePreviewStart(request)) throw new RequestError(400, 'voice-preview-invalid')
      const owner = ownerOf(document, member)
      current(document, member, request.source)
      await owner.checkPreview(request, signal)
      current(document, member, request.source)
    },
    cancel: async (document, query, member) => ownerOf(document, member).cancel(query),
    quotePreview: (document, query, member, signal) => ownerOf(document, member).quote(query, execution(document, member), signal),
    preview: (document, request, member, signal) => {
      if (!validateVoicePreviewStart(request)) throw new RequestError(400, 'voice-preview-invalid')
      const owner = ownerOf(document, member)
      current(document, member, request.source)
      return owner.preview(request, signal)
    },
    readPreview: async (document, id, member) => ownerOf(document, member).readPreview(id),
  }
  return { service, routes: createVoiceoverRoutes(service), async close() { closed = true; for (const operation of pending) operation.controller.abort(); await Promise.allSettled([...owners.values()].map(owner => owner.close())); await Promise.allSettled([...pending].map(operation => operation.finished)); owners.clear() } }
}
