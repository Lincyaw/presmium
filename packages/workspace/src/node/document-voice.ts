import { DOCUMENT_ENTRY, VOICE_CLONE_MAX_AUDIO_BYTES, fnv1a64, hasRole, speechEngineId } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentVoiceAuthoring, DocumentVoiceCloneAudio, Finding, Member, PreparedVoiceClone, SpeechService, VoiceoverExecution, VoiceoverJob } from '@lincyaw/kernel'
import { createVoiceoverOwner, createVoiceoverRoutes, validateDocumentVoiceCatalogQuery, validateDocumentVoiceClone, validateDocumentVoiceCloneQuery, validateVoicePreviewStart } from '@lincyaw/kernel/node'
import { extname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { readDocumentAudioBytes } from './document-audio.ts'
import { readAuthoringDocument } from './document-editor.ts'
import { RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'
import type { MediaUploadsOwner } from './media-uploads.ts'

export interface DocumentVoiceServices { speech?: SpeechService, voiceover?: { version: 1, preview: true }, voiceoverExecution?: VoiceoverExecution, findings?: Finding[] }
export interface DocumentVoiceAuthoringOptions {
  editor: SourceEditor
  services(document: string, source: CanonicalSource): Promise<DocumentVoiceServices>
  revision?(document: string): string | undefined
  uploads?: MediaUploadsOwner
}
const same = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint

export function createDocumentVoiceAuthoring({ editor, services, revision, uploads }: DocumentVoiceAuthoringOptions) {
  const pending = new Set<{ controller: AbortController, finished: Promise<unknown> }>()
  const owners = new Map<string, ReturnType<typeof createVoiceoverOwner>>()
  const clones = new Map<string, { document: string, member: string, request: string, prepared: PreparedVoiceClone }>()
  const cloneEntry = (document: string, id: string, member: Member) => {
    if (!hasRole(member, 'owner')) throw new RequestError(403, 'voice-clone-permission-denied')
    authorize(document, member)
    const entry = clones.get(id)
    if (entry && (entry.document !== document || entry.member !== member.id)) throw new RequestError(403, 'voice-clone-permission-denied')
    return entry
  }
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
    prepareClone: (document, value, member, signal) => work(signal, async signal => {
      if (!hasRole(member, 'owner')) throw new RequestError(403, 'voice-clone-permission-denied')
      if (!validateDocumentVoiceClone(value)) throw new RequestError(400, 'voice-clone-invalid')
      if (clones.size >= 4) throw new RequestError(503, 'voice-authoring-busy')
      const request = structuredClone(value), loaded = await load(document, member, signal, request.source)
      const speech = loaded.speech, engine = request.engine ?? await speech?.defaultSynthesisEngine?.()
      const read = async (input: DocumentVoiceCloneAudio) => {
        const path = typeof input === 'string' ? input : undefined
        if (path !== undefined && path.split(/[\\/]/).some(part => part.startsWith('.'))) throw new RequestError(403, 'audio-file-path')
        const uploaded = typeof input !== 'string' ? uploads?.read(document, loaded.source.documentId, member, input.upload, 'audio') : undefined
        if (path === undefined && !uploaded) throw new RequestError(503, 'media-upload-unavailable')
        const types: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac' }
        const type = types[extname(path ?? uploaded!.name).toLowerCase()]
        if (!type) throw new RequestError(422, 'voice-clone-audio-type')
        if (path !== undefined) editor.assertEditable({ document, home: false }, path, member)
        const bytes = uploaded?.bytes ?? await readDocumentAudioBytes(editor, { document, member, rest: '' }, path!, signal, VOICE_CLONE_MAX_AUDIO_BYTES)
        if (bytes.length > VOICE_CLONE_MAX_AUDIO_BYTES) throw new RequestError(413, 'production.asset-size')
        return { bytes, type }
      }
      const [sampleRead, statementRead] = await Promise.allSettled([read(request.sample), read(request.consent.statement)])
      if (sampleRead.status === 'rejected') throw sampleRead.reason
      if (statementRead.status === 'rejected') throw statementRead.reason
      const sampleInput = sampleRead.value, statementInput = statementRead.value
      current(document, member, loaded.source); signal.throwIfAborted()
      if (!speech?.cloneVoice || !engine || !(await speech.engines()).some(info => info.id === speechEngineId(engine) && info.clone)) throw new RequestError(409, 'voice-clone-unavailable')
      current(document, member, loaded.source); signal.throwIfAborted()
      // Several readers may finish concurrently; the retained byte budget is checked again before retaining blobs.
      if (clones.size >= 4) throw new RequestError(503, 'voice-authoring-busy')
      let sample: Blob | undefined = new Blob([sampleInput.bytes as Uint8Array<ArrayBuffer>], { type: sampleInput.type })
      let statement: Blob | undefined = new Blob([statementInput.bytes as Uint8Array<ArrayBuffer>], { type: statementInput.type })
      let started: ReturnType<NonNullable<SpeechService['cloneVoice']>> | undefined
      let expired = false
      const id = randomBytes(32).toString('hex')
      const prepared: PreparedVoiceClone = { engine: speechEngineId(engine), voice: request.voice,
        start: startSignal => {
          if (started) return started
          if (expired || !sample || !statement) return Promise.reject(new RequestError(409, 'voice-clone-expired'))
          clearTimeout(timer)
          const exactSample = sample, exactStatement = statement
          started = work(startSignal, async ownedSignal => {
            current(document, member, loaded.source); ownedSignal.throwIfAborted()
            return speech.cloneVoice!({ engine, voice: request.voice, sample: exactSample,
              ...request.lang ? { lang: request.lang } : {}, ...request.text ? { text: request.text } : {},
              consent: { speaker: request.consent.speaker, scope: request.consent.scope, statement: exactStatement } }, ownedSignal)
          }).finally(() => prepared.close())
          return started
        },
        close: () => { expired = true; clearTimeout(timer); sample = undefined; statement = undefined; clones.delete(id) },
      }
      const timer = setTimeout(() => prepared.close(), 90000)
      timer.unref()
      clones.set(id, { document, member: member.id, request: JSON.stringify(request), prepared })
      return prepared
    }),
    prepareCloneReference: async (document, request, member, signal) => {
      const prepared = await service.prepareClone!(document, request, member, signal)
      const found = [...clones].find(([, entry]) => entry.prepared === prepared)
      if (!found) { prepared.close(); throw new RequestError(409, 'voice-clone-expired') }
      if (signal?.aborted) { prepared.close(); signal.throwIfAborted() }
      return { id: found[0], engine: prepared.engine, voice: prepared.voice }
    },
    runPreparedClone: (document, id, request, member, signal) => {
      const entry = cloneEntry(document, id, member)
      if (!entry) throw new RequestError(409, 'voice-clone-expired')
      if (entry.request !== JSON.stringify(request)) throw new RequestError(409, 'voice-clone-preparation-changed')
      try { return entry.prepared.start(signal) }
      catch (error) { entry.prepared.close(); throw error }
    },
    releasePreparedClone: (document, id, member) => {
      const entry = cloneEntry(document, id, member)
      entry?.prepared.close()
      return Boolean(entry)
    },
    cloneStatus: (document, query, member, signal) => work(signal, async signal => {
      if (!hasRole(member, 'owner')) throw new RequestError(403, 'voice-clone-permission-denied')
      if (!validateDocumentVoiceCloneQuery(query)) throw new RequestError(400, 'voice-clone-invalid')
      const loaded = await load(document, member, signal), speech = loaded.speech, engine = query.engine ?? await speech?.defaultSynthesisEngine?.()
      if (!speech?.cloneStatus || !engine || !(await speech.engines()).some(info => info.id === speechEngineId(engine) && info.clone)) throw new RequestError(409, 'voice-clone-unavailable')
      current(document, member, loaded.source); signal.throwIfAborted()
      return speech.cloneStatus(engine, query.voice, signal)
    }),
    capabilities: (document, member, signal) => work(signal, async signal => {
      const loaded = await load(document, member, signal)
      const [engines, defaultEngine] = await Promise.all([loaded.speech?.engines() ?? [], loaded.speech?.defaultSynthesisEngine?.()])
      signal.throwIfAborted(); current(document, member, loaded.source)
      const configured = engines.some(engine => engine.tts), unknown = !loaded.speech && loaded.findings?.some(finding => finding.severity === 'error')
      const implemented = Boolean(loaded.voiceoverExecution)
      return { document, source: loaded.source, verification: 'configuration-only', status: configured ? 'configured' : unknown ? 'unknown' : 'unavailable', ...!configured ? { reason: unknown ? 'services-unavailable' : 'not-configured' } as const : {}, voiceover: implemented, preview: implemented, engines, ...defaultEngine ? { defaultEngine } : {}, ...loaded.findings?.length ? { findings: loaded.findings } : {}, actions: { status: implemented, list: true, get: true, start: implemented && configured, cancel: true, quotePreview: implemented, preview: implemented && configured, readPreview: true, clone: hasRole(member, 'owner') && Boolean(loaded.speech?.cloneVoice) && engines.some(engine => engine.clone), cloneStatus: hasRole(member, 'owner') && Boolean(loaded.speech?.cloneStatus) && engines.some(engine => engine.clone) }, tasks: { idempotency: 'process', limits: ownerOf(document, member).limits } }
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
  return { service, routes: createVoiceoverRoutes(service), async close() { closed = true; for (const { prepared } of clones.values()) prepared.close(); for (const operation of pending) operation.controller.abort(); await Promise.allSettled([...owners.values()].map(owner => owner.close())); await Promise.allSettled([...pending].map(operation => operation.finished)); owners.clear() } }
}
