import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, opendir, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { DOCUMENT_ENTRY, fnv1a64, hasRole, isRecord, jsonResponse, ProductionAudioRefusal, TRANSCRIPTION_REQUEST_MAX_BYTES } from '@lincyaw/kernel'
import { productionAssetFile, validateDocumentTranscriptionRequest } from '@lincyaw/kernel/node'
import type { CanonicalSource, DocumentTranscriptions, Finding, Member, ProductionAudioAuthoring, RequestContext, Route, SpeechEngineInfo, SpeechService, Transcript, DocumentTranscriptionRequest, TranscriptionListAnswer, TranscriptionRevision, TranscriptionTask } from '@lincyaw/kernel'
import { readAuthoringDocument } from './document-editor.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { SourceEditor } from './source-editor.ts'

export interface TranscriptionServices { audio?: ProductionAudioAuthoring, speech?: SpeechService, findings?: Finding[] }
interface Options extends TranscriptionServices {
  root: string
  editor: SourceEditor
  /** Assemble Node services for this exact source without compiling scenes or executing passes. */
  services?(document: string, source: CanonicalSource): Promise<TranscriptionServices>
}
interface RecordEntry { format: 1, document: string, documentId: string, member: string, intent: string, payload?: string, cancelled?: true, task?: TranscriptionTask }
interface Active { record: RecordEntry, directory: string, controller: AbortController, saving: Promise<void>, finished?: Promise<void> }
const MAX_AUDIO = 16 << 20, MAX_RESULT = 2 << 20, MAX_TASKS = 1024
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const idValid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{64}$/.test(value)
const intentValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z\d_-]{16,128}$/.test(value)
const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const now = () => new Date().toISOString()
const ctxOf = (document: string, member: Member): RequestContext => ({ document, member, rest: '' })

async function readBounded(file: string, limit: number): Promise<Uint8Array> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
    if (error.code === 'ELOOP') throw new RequestError(403, 'transcription-storage-path')
    throw error
  })
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new RequestError(403, 'transcription-storage-path')
    if (stat.size > limit) throw new RequestError(413, 'transcription-file-size')
    const bytes = new Uint8Array(stat.size + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    if (length > stat.size) throw new RequestError(409, 'transcription-file-changed')
    return bytes.slice(0, length)
  } finally { await handle.close() }
}

async function directory(path: string, create: boolean): Promise<void> {
  if (create) await mkdir(path).catch(error => { if (error.code !== 'EEXIST') throw error })
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new RequestError(403, 'transcription-storage-path')
}

async function taskNames(path: string, limit: number): Promise<string[]> {
  const names: string[] = []
  for await (const entry of await opendir(path)) { names.push(entry.name); if (names.length >= limit) break }
  return names
}

async function writeJson(path: string, value: unknown, exclusive = false): Promise<void> {
  const text = JSON.stringify(value)
  if (Buffer.byteLength(text) > MAX_RESULT) throw new RequestError(413, 'transcription-result-size')
  const target = exclusive ? path : `${path}.${randomUUID()}.tmp`
  const file = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await file.writeFile(text); await file.sync() }
  catch (error) { await unlink(target).catch(() => undefined); throw error }
  finally { await file.close() }
  if (!exclusive) {
    try { await rename(target, path) }
    catch (error) { await unlink(target).catch(() => undefined); throw error }
  }
}

/** Recognition is an immutable candidate. Only a later, separate authoring action may adopt it. */
export function createDocumentTranscriptions({ root, editor, audio, speech, services }: Options): DocumentTranscriptions & { close(): Promise<void> } {
  const active = new Map<string, Active>()
  const admitting = new Map<string, { document: string, documentId: string, member: string, intent: string, controller: AbortController, finished: Promise<void> }>()
  let closed = false
  const authorize = (document: string, member: Member) => {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'transcription-permission-denied')
    if (closed) throw new RequestError(503, 'transcription-closed')
    // Cancelling already-admitted work needs file permission, not valid editable JSON.
    return editor.readableFile(editor.scope(document), document ? `${document}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY, member)
  }
  const opened = (document: string, member: Member) => {
    authorize(document, member)
    const current = readAuthoringDocument(editor, ctxOf(document, member))
    return { ...current, binding: { documentId: current.content.id, version: current.source.version, fingerprint: fnv1a64(current.source.content) } }
  }
  const servicesOf = (document: string, source: CanonicalSource) => services ? services(document, source) : Promise.resolve({ audio, speech })
  const capabilityOf = async (source: CanonicalSource, resolved: TranscriptionServices) => {
    const engines = resolved.speech ? (await resolved.speech.engines()).filter(engine => engine.stt) : []
    const available = Boolean(resolved.audio && engines.length)
    const unknown = !available && resolved.findings?.some(finding => finding.severity === 'error')
    return { source, available, status: available ? 'available' as const : unknown ? 'unknown' as const : 'unavailable' as const, ...unknown ? { reason: 'services-unavailable' as const } : !resolved.audio ? { reason: 'audio-unavailable' as const } : !resolved.speech ? { reason: 'speech-unavailable' as const } : !engines.length ? { reason: 'engine-unavailable' as const } : {}, verification: 'configuration-only' as const, ...resolved.findings?.length ? { findings: resolved.findings } : {}, engines, range: 'whole-asset' as const, limits: { audioBytes: MAX_AUDIO, durationMs: 600_000, tasks: MAX_TASKS, requestBytes: TRANSCRIPTION_REQUEST_MAX_BYTES } }
  }
  const taskId = (document: string, documentId: string, member: Member, intent: string) => hash(JSON.stringify([document, documentId, member.id, intent]))
  const storage = async (document: string, member: Member, id: string, create = false) => {
    if (!idValid(id)) throw new RequestError(400, 'transcription-id-invalid')
    const path = join(dirname(authorize(document, member)), 'transcriptions')
    await directory(path, create)
    const target = join(path, id)
    if (create && !(await lstat(target).catch(() => undefined)) && (await taskNames(path, MAX_TASKS)).length >= MAX_TASKS) throw new RequestError(503, 'transcription-intent-capacity')
    await directory(target, create)
    return target
  }
  const load = async (document: string, member: Member, id: string): Promise<{ record: RecordEntry, directory: string } | undefined> => {
    try {
      const target = await storage(document, member, id)
      const text = new TextDecoder().decode(await readBounded(join(target, 'task.json'), MAX_RESULT))
      let record: RecordEntry
      try { record = JSON.parse(text) } catch { throw new RequestError(409, 'transcription-record-invalid') }
      if (!isRecord(record) || record.format !== 1 || record.document !== document || typeof record.documentId !== 'string' || typeof record.member !== 'string' || !intentValid(record.intent)
        || hash(JSON.stringify([record.document, record.documentId, record.member, record.intent])) !== id
        || record.task && (!isRecord(record.task) || record.task.kind !== 'transcription' || record.task.id !== id || record.task.document !== document || record.task.intent !== record.intent || typeof record.task.createdAt !== 'string'
          || !isRecord(record.task.source) || record.task.source.documentId !== record.documentId || typeof record.task.source.version !== 'string' || !/^[a-f\d]{20}$/.test(record.task.source.version) || typeof record.task.source.fingerprint !== 'string' || !/^[a-f\d]{16}$/.test(record.task.source.fingerprint)
          || !isRecord(record.task.audio) || typeof record.task.audio.assetId !== 'string' || !idValid(record.task.audio.sha256) || !Number.isSafeInteger(record.task.sequence) || record.task.sequence < 0
          || !['queued', 'running', 'cancelling', 'cancelled', 'done', 'failed'].includes(record.task.state) || !isRecord(record.task.progress) || !['queued', 'recognizing', 'saving', 'finished'].includes(record.task.progress.phase)
          || record.task.state === 'done' && !isRecord(record.task.result)
          || record.task.result !== undefined && (!isRecord(record.task.result) || record.task.result.transcriptionId !== id || !idValid(record.task.result.revision)))) throw new RequestError(409, 'transcription-record-invalid')
      return { record, directory: target }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  }
  const persist = (entry: Active) => {
    const snapshot = structuredClone(entry.record)
    entry.saving = entry.saving.catch(() => undefined).then(() => writeJson(join(entry.directory, 'task.json'), snapshot))
    return entry.saving
  }
  const change = (entry: Active) => { entry.record.task!.sequence++; return persist(entry) }
  type Observation = { current?: ReturnType<typeof opened>, audio: Map<string, Promise<boolean>> }
  const observe = (document: string, member: Member): Observation => {
    try { return { current: opened(document, member), audio: new Map() } }
    catch (error) { if (error instanceof RequestError && error.status === 422) return { audio: new Map() }; throw error }
  }
  const present = async (document: string, member: Member, task: TranscriptionTask, observation?: Observation): Promise<TranscriptionTask> => {
    authorize(document, member)
    const shown = structuredClone(task)
    // A journal from an interrupted owner is not permission to repeat a spending request.
    if (!active.has(task.id) && ['queued', 'running', 'cancelling'].includes(shown.state)) { shown.state = 'failed'; shown.error = 'transcription-interrupted' }
    try {
      const current = observation ? observation.current : opened(document, member)
      if (!current) { shown.current = false; shown.staleReason = 'document-unavailable'; return shown }
      shown.current = sameSource(current.binding, shown.source)
      if (!shown.current) shown.staleReason = 'document-changed'
      else {
        const key = JSON.stringify([shown.audio.assetId, shown.audio.sha256])
        let checked = observation?.audio.get(key)
        if (!checked) {
          checked = (async () => {
            const asset = current.content.assets[shown.audio.assetId]
            const path = asset?.kind === 'audio' && productionAssetFile(join(root, document), asset.location)
            const file = path && editor.readableFile(editor.scope(document), relative(root, path).split('\\').join('/'), member)
            return Boolean(file && hash(await readBounded(file, MAX_AUDIO)) === shown.audio.sha256)
          })().catch(() => false)
          observation?.audio.set(key, checked)
        }
        if (!await checked) { shown.current = false; shown.staleReason = 'audio-changed' }
      }
      if (!observation && !sameSource(opened(document, member).binding, shown.source)) { shown.current = false; shown.staleReason = 'document-changed' }
    } catch (error) {
      if (!(error instanceof RequestError) || error.status !== 422) throw error
      shown.current = false; shown.staleReason = 'document-unavailable'
    }
    return shown
  }
  const resolveId = (document: string, member: Member, query: { id: string } | { intent: string }) => {
    authorize(document, member)
    if ('id' in query) { if (!idValid(query.id)) throw new RequestError(400, 'transcription-id-invalid'); return query.id }
    if (!intentValid(query.intent)) throw new RequestError(400, 'transcription-intent-invalid')
    const running = [...active.values()].find(entry => entry.record.document === document && entry.record.member === member.id && entry.record.intent === query.intent)
    if (running) return running.record.task!.id
    const pending = [...admitting.entries()].find(([, entry]) => entry.document === document && entry.member === member.id && entry.intent === query.intent)
    if (pending) return pending[0]
    try { return taskId(document, opened(document, member).content.id, member, query.intent) }
    catch (error) { if (error instanceof RequestError && error.status === 422) throw new RequestError(409, 'transcription-task-id-required'); throw error }
  }
  const lookup = async (document: string, member: Member, query: { id: string } | { intent: string }) => {
    const id = resolveId(document, member, query)
    const entry = active.get(id) ?? await load(document, member, id)
    if (!entry) throw new RequestError(404, 'transcription-task-missing')
    if (entry.record.document !== document) throw new RequestError(409, 'transcription-document-changed')
    return { id, entry }
  }
  const inspect = async (document: string, member: Member, request: DocumentTranscriptionRequest, signal?: AbortSignal) => {
    const current = opened(document, member)
    if (!sameSource(current.binding, request.source)) throw new RequestError(409, 'document-version-changed')
    const asset = current.content.assets[request.assetId]
    if (!asset || asset.kind !== 'audio') throw new RequestError(422, 'transcription-audio-required')
    const path = productionAssetFile(join(root, document), asset.location)
    if (!path) throw new RequestError(422, 'production.asset-path')
    const file = editor.readableFile(editor.scope(document), relative(root, path).split('\\').join('/'), member)
    const bytes = await readBounded(file, MAX_AUDIO)
    if (!bytes.length || hash(bytes) !== request.audioSha256 || asset.fingerprint !== undefined && asset.fingerprint !== `sha256:${request.audioSha256}`) throw new RequestError(409, 'transcription-audio-changed')
    const resolved = await servicesOf(document, current.binding)
    if (!resolved.audio) throw new RequestError(503, 'transcription-audio-unavailable')
    const { inspection } = await resolved.audio.inspectBytes(asset.id, bytes, signal)
    signal?.throwIfAborted()
    if (inspection.sha256 !== request.audioSha256) throw new RequestError(409, 'transcription-audio-changed')
    if (!Number.isFinite(inspection.durationMs) || inspection.durationMs <= 0 || inspection.durationMs > 600_000) throw new RequestError(422, 'production.asset-duration')
    if (!sameSource(opened(document, member).binding, request.source)) throw new RequestError(409, 'document-version-changed')
    return { bytes, inspection, services: resolved }
  }
  const capabilities: DocumentTranscriptions['capabilities'] = async (document, member) => {
    const current = opened(document, member)
    const capability = await capabilityOf(current.binding, await servicesOf(document, current.binding))
    if (!sameSource(opened(document, member).binding, current.binding)) throw new RequestError(409, 'document-version-changed')
    return capability
  }
  /** Everything start checks before it stores a task; a replay of the same intent returns its recorded task. */
  const admission = async (document: string, request: DocumentTranscriptionRequest, member: Member, signal?: AbortSignal) => {
    if (!validateDocumentTranscriptionRequest(request)) throw new RequestError(400, 'transcription-request-invalid')
    if (Buffer.byteLength(JSON.stringify(request)) > TRANSCRIPTION_REQUEST_MAX_BYTES) throw new RequestError(413, 'transcription-request-size')
    const current = opened(document, member), id = taskId(document, current.content.id, member, request.intent), payload = hash(JSON.stringify([request.source.documentId, request.source.version, request.source.fingerprint, request.assetId, request.audioSha256, request.engine, request.lang ?? null, request.hints ?? []]))
    const previous = active.get(id) ?? await load(document, member, id)
    if (previous) {
      if (previous.record.cancelled) throw new RequestError(409, 'transcription-intent-cancelled')
      if (previous.record.payload !== payload) throw new RequestError(409, 'transcription-intent-reused')
      const task = previous.record.task
      if (!task) throw new RequestError(409, 'transcription-record-invalid')
      return { current, id, payload, previous: task }
    }
    const input = await inspect(document, member, request, signal)
    const capability = await capabilityOf(request.source, input.services)
    const engine = capability.engines.find(engine => engine.id === request.engine)
    if (!engine) {
      // Asking for an engine that is configured but does not recognize speech, or is not configured, is a bad request; only unresolved speech services may come back.
      const speech = capability.status === 'unknown' ? undefined : input.services.speech
      if (!speech) throw new RequestError(503, 'transcription-engine-unavailable')
      const named = (await speech.engines()).some(own => own.id === request.engine)
      throw new RequestError(422, named ? 'transcription-engine-unsupported' : 'transcription-engine-unknown', { engine: request.engine, engines: capability.engines.map(own => own.id) })
    }
    signal?.throwIfAborted()
    if (!sameSource(opened(document, member).binding, request.source)) throw new RequestError(409, 'document-version-changed')
    if ([...active.values()].some(entry => entry.record.document === document) || [...admitting.values()].some(entry => entry.document === document)) throw new RequestError(409, 'transcription-busy')
    return { current, id, payload, input, engine }
  }
  const run = async (entry: Active, request: DocumentTranscriptionRequest, engine: SpeechEngineInfo, input: Awaited<ReturnType<typeof inspect>>) => {
    const task = entry.record.task!, signal = entry.controller.signal
    try {
      await setImmediate()
      signal.throwIfAborted()
      task.state = 'running'; task.startedAt = now(); task.progress.phase = 'recognizing'; await change(entry)
      signal.throwIfAborted()
      const transcript = await input.services.speech!.transcribe({ engine: engine.id, audio: new Blob([new Uint8Array(input.bytes)], { type: input.inspection.mediaType }), lang: request.lang, hints: request.hints }, signal)
      signal.throwIfAborted()
      const result = normalizeTranscript(transcript, input.inspection.durationMs, task.id)
      task.progress.phase = 'saving'; await change(entry)
      signal.throwIfAborted()
      const candidate = { transcriptionId: task.id, createdAt: now(), source: request.source, audio: { assetId: request.assetId, sha256: request.audioSha256, sourceRange: { startMs: 0, endMs: input.inspection.durationMs } }, request: { engine: engine.id, provider: engine.provider, local: engine.local, ...request.lang ? { lang: request.lang } : {}, hints: request.hints ?? [], fingerprint: entry.record.payload! }, ...result }
      const revision = hash(JSON.stringify(candidate))
      await writeJson(join(entry.directory, `${revision}.json`), { ...candidate, revision }, true)
      task.result = { transcriptionId: task.id, revision }
      signal.throwIfAborted()
      task.state = 'done'
    } catch (error) {
      task.state = signal.aborted ? 'cancelled' : 'failed'
      if (!signal.aborted) task.error = error instanceof RequestError ? error.message : 'transcription-provider-failed'
    } finally {
      task.finishedAt = now(); task.progress.phase = 'finished'
      await change(entry).catch(() => { task.state = 'failed'; task.error = 'transcription-storage-failed' })
      // Retain the task record, not its audio bytes or AbortController, after completion.
      active.delete(task.id)
    }
  }
  return {
    capabilities,
    async list(document, member): Promise<TranscriptionListAnswer> {
      const path = join(dirname(authorize(document, member)), 'transcriptions'), observation = observe(document, member)
      let stored: string[] = []
      try { await directory(path, false); stored = await taskNames(path, MAX_TASKS + 1) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      const all = [...new Set([...active.values()].filter(entry => entry.record.document === document).map(entry => entry.record.task!.id).concat(stored.sort()))]
      const ids = all.slice(0, MAX_TASKS), answer: TranscriptionListAnswer = { tasks: [], issues: [], ...all.length > MAX_TASKS ? { truncated: true } : {} }
      let index = 0, bytes = 0
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (index < ids.length) {
          const id = ids[index++]!
          if (!idValid(id)) { answer.issues.push({ id, code: 'transcription-storage-entry-invalid' }); continue }
          try {
            const entry = active.get(id) ?? await load(document, member, id)
            if (!entry) { if (admitting.get(id)?.document !== document) answer.issues.push({ id, code: 'transcription-record-missing' }); continue }
            if (!entry.record.task) { if (!entry.record.cancelled) answer.issues.push({ id, code: 'transcription-record-invalid' }); continue }
            const task = await present(document, member, entry.record.task, observation), size = Buffer.byteLength(JSON.stringify(task))
            if (bytes + size > MAX_RESULT) { answer.truncated = true; answer.issues.push({ id, code: 'transcription-list-size' }); continue }
            bytes += size; answer.tasks.push(task)
          } catch (error) {
            if (!(error instanceof RequestError)) throw error
            answer.issues.push({ id, code: error.message })
          }
        }
      }))
      const latest = observe(document, member)
      if (!latest.current || !observation.current || !sameSource(latest.current.binding, observation.current.binding)) for (const task of answer.tasks) {
        task.current = false; task.staleReason = latest.current ? 'document-changed' : 'document-unavailable'
      }
      answer.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      answer.issues.sort((a, b) => a.id.localeCompare(b.id))
      // Account for issues and JSON framing too, without repeatedly serializing the whole list.
      let size = Buffer.byteLength(JSON.stringify(answer))
      if (size > MAX_RESULT) {
        answer.truncated = true; size = Buffer.byteLength(JSON.stringify(answer))
        while (size > MAX_RESULT && (answer.tasks.length || answer.issues.length)) {
          const items = answer.tasks.length ? answer.tasks : answer.issues
          const removed = items.pop()!
          size -= Buffer.byteLength(JSON.stringify(removed)) + (items.length ? 1 : 0)
        }
      }
      return answer
    },
    async checkStart(document, request, member, signal) { await admission(document, request, member, signal) },
    async checkCancel(document, query, member) {
      const id = resolveId(document, member, query)
      if (admitting.has(id)) return undefined
      const running = active.get(id), entry = running ?? await load(document, member, id)
      if (!entry) { if ('intent' in query) return undefined; throw new RequestError(404, 'transcription-task-missing') }
      const task = entry.record.task
      // A journal left queued or running by an interrupted owner is still corrected by cancel.
      if (task && (running ? task.state === 'queued' || task.state === 'running' : ['queued', 'running', 'cancelling'].includes(task.state))) return undefined
      return { intent: entry.record.intent, state: task?.state ?? 'cancelled', ...task ? { task: await present(document, member, task) } : {} }
    },
    async start(document, request, member, signal) {
      const admitted = await admission(document, request, member, signal)
      if (admitted.previous) return present(document, member, admitted.previous)
      const { current, id, payload, input, engine } = admitted
      const controller = new AbortController()
      let finished!: () => void
      admitting.set(id, { document, documentId: current.content.id, member: member.id, intent: request.intent, controller, finished: new Promise<void>(resolve => { finished = resolve }) })
      try {
        const target = await storage(document, member, id, true)
        if (!sameSource(opened(document, member).binding, request.source)) throw new RequestError(409, 'document-version-changed')
        const task: TranscriptionTask = { kind: 'transcription', id, intent: request.intent, document, source: request.source, audio: { assetId: request.assetId, sha256: request.audioSha256 }, sequence: 0, state: 'queued', current: true, progress: { phase: 'queued' }, createdAt: now() }
        const entry: Active = { record: { format: 1, document, documentId: current.content.id, member: member.id, intent: request.intent, payload, task }, directory: target, controller, saving: Promise.resolve() }
        try { await writeJson(join(target, 'task.json'), entry.record, true) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            const existing = await load(document, member, id)
            if (existing?.record.cancelled) throw new RequestError(409, 'transcription-intent-cancelled')
            if (existing?.record.payload !== payload || !existing.record.task) throw new RequestError(409, 'transcription-intent-reused')
            return present(document, member, existing.record.task)
          }
          throw error
        }
        if (closed || signal?.aborted || controller.signal.aborted) { controller.abort(); task.state = 'cancelled'; task.finishedAt = now(); task.progress.phase = 'finished'; await change(entry); return structuredClone(task) }
        active.set(id, entry)
        const accepted = structuredClone(task)
        entry.finished = run(entry, structuredClone(request), engine, input)
        void entry.finished.catch(() => undefined)
        return accepted
      } finally { admitting.delete(id); finished() }
    },
    async get(document, query, member) {
      const { entry } = await lookup(document, member, query)
      if (!entry.record.task) throw new RequestError(409, 'transcription-intent-cancelled')
      return present(document, member, entry.record.task)
    },
    async readResult(document, id, revision, member) {
      if (!idValid(revision)) throw new RequestError(400, 'transcription-revision-invalid')
      const { entry } = await lookup(document, member, { id })
      if (entry.record.task?.result?.revision !== revision) throw new RequestError(404, 'transcription-result-missing')
      const candidate = JSON.parse(new TextDecoder().decode(await readBounded(join(entry.directory, `${revision}.json`), MAX_RESULT))) as TranscriptionRevision
      const { revision: recorded, ...content } = candidate
      if (candidate.transcriptionId !== id || recorded !== revision || hash(JSON.stringify(content)) !== revision) throw new RequestError(409, 'transcription-result-changed')
      return candidate
    },
    async verifyResult(document, id, revision, source, member) {
      const candidate = await this.readResult(document, id, revision, member)
      if (!isRecord(candidate.source) || candidate.source.documentId !== source.documentId || !isRecord(candidate.audio) || typeof candidate.audio.assetId !== 'string' || !idValid(candidate.audio.sha256)
        || !isRecord(candidate.audio.sourceRange) || !isRecord(candidate.result) || typeof candidate.result.text !== 'string' || !Array.isArray(candidate.result.segments)
        || !candidate.result.segments.length || candidate.result.segments.length > 10_000
        || candidate.result.segments.some(segment => !isRecord(segment) || typeof segment.id !== 'string' || !segment.id || segment.id.length > 200 || typeof segment.text !== 'string')
        || new Set(candidate.result.segments.map(segment => segment.id)).size !== candidate.result.segments.length) throw new RequestError(422, 'transcription-result-invalid')
      const { inspection } = await inspect(document, member, { intent: 'result-verification', source, assetId: candidate.audio.assetId, audioSha256: candidate.audio.sha256, engine: '', confirmed: true })
      if (candidate.audio.sourceRange.startMs !== 0 || candidate.audio.sourceRange.endMs !== inspection.durationMs) throw new RequestError(409, 'transcription-audio-changed')
      return candidate
    },
    async cancel(document, query, member) {
      const id = resolveId(document, member, query)
      const pending = admitting.get(id)
      pending?.controller.abort()
      let entry = active.get(id) ?? await load(document, member, id)
      if (!entry) {
        if (!('intent' in query)) throw new RequestError(404, 'transcription-task-missing')
        const current = opened(document, member)
        const target = await storage(document, member, id, true)
        const record: RecordEntry = { format: 1, document, documentId: current.content.id, member: member.id, intent: query.intent, cancelled: true }
        try { await writeJson(join(target, 'task.json'), record, true) }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return this.cancel(document, query, member); throw error }
        return { intent: query.intent, state: 'cancelled' }
      }
      const task = entry.record.task
      if (task && ['queued', 'running', 'cancelling'].includes(task.state)) {
        const running = active.get(id)
        task.state = running ? task.state !== 'queued' ? 'cancelling' : 'cancelled' : pending ? 'cancelled' : 'failed'
        running?.controller.abort()
        if (running) await change(running)
        else { if (!pending) task.error = 'transcription-interrupted'; task.finishedAt = now(); task.sequence++; await writeJson(join(entry.directory, 'task.json'), entry.record) }
      }
      return { intent: entry.record.intent, state: task?.state ?? 'cancelled', ...task ? { task: await present(document, member, task) } : {} }
    },
    async close() {
      closed = true
      const entries = [...active.values()]
      for (const entry of entries) entry.controller.abort()
      const admissions = [...admitting.values()]
      for (const entry of admissions) entry.controller.abort()
      await Promise.allSettled([...entries.map(entry => entry.finished), ...admissions.map(entry => entry.finished)])
      active.clear()
    },
  }
}

export function normalizeTranscript(transcript: Transcript, durationMs: number, id: string): Pick<TranscriptionRevision, 'result' | 'timing' | 'warnings'> {
  if (!isRecord(transcript) || typeof transcript.text !== 'string' || typeof transcript.lang !== 'string' || !Array.isArray(transcript.segments) || transcript.segments.length > 10_000 || Buffer.byteLength(JSON.stringify(transcript)) > MAX_RESULT) throw new RequestError(422, 'transcription-result-invalid')
  if (!transcript.segments.length && transcript.text.length) return { result: { lang: transcript.lang, text: transcript.text, segments: [{ id: `${id}:1`, text: transcript.text }] }, timing: 'none', warnings: ['transcription-timing-unavailable'] }
  const warnings = new Set<string>()
  const range = (start: unknown, end: unknown) => typeof start === 'number' && typeof end === 'number' && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && Math.round(end * 1000) > Math.round(start * 1000) && Math.round(end * 1000) <= durationMs ? { startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) } : undefined
  let previousStart = 0
  const segments = transcript.segments.map((segment, index) => {
    if (!isRecord(segment) || typeof segment.text !== 'string' || !Array.isArray(segment.words) || segment.words.length > 100_000) throw new RequestError(422, 'transcription-result-invalid')
    let timing = range(segment.start, segment.end)
    if (timing && timing.startMs < previousStart) timing = undefined
    if (timing) previousStart = timing.startMs
    if (!timing) warnings.add('transcription-timing-unavailable')
    let previousWordEnd = timing?.startMs ?? 0
    const words = segment.words.flatMap(word => {
      const at = isRecord(word) && range(word.start, word.end)
      if (!at || typeof word.text !== 'string' || !word.text.trim() || !timing || at.startMs < previousWordEnd || at.endMs > timing.endMs) { warnings.add('transcription-timing-unavailable'); return [] }
      previousWordEnd = at.endMs
      return [{ text: word.text, ...at }]
    })
    return { id: `${id}:${index + 1}`, text: segment.text, ...timing, ...words.length ? { words } : {} }
  })
  return { result: { lang: transcript.lang, text: transcript.text, segments }, timing: segments.some(segment => segment.words?.length) ? 'words' : segments.some(segment => segment.startMs !== undefined) ? 'segments' : 'none', warnings: [...warnings] }
}

/** Thin HTTP adapter; source/permission/idempotency rules live in the shared service. */
export function documentTranscriptionRoutes(service: DocumentTranscriptions): Record<string, Route> {
  const query = (value: unknown): { id: string } | { intent: string } => {
    if (!isRecord(value) || Object.keys(value).length !== 1) throw new RequestError(400, 'transcription-query-invalid')
    if (typeof value.id === 'string' && idValid(value.id)) return { id: value.id }
    if (typeof value.intent === 'string' && intentValid(value.intent)) return { intent: value.intent }
    throw new RequestError(400, 'transcription-query-invalid')
  }
  const guarded = (work: () => Promise<unknown>) => catchRequestErrors(async () => {
    try { return jsonResponse(await work()) }
    catch (error) { if (error instanceof ProductionAudioRefusal) throw new RequestError(error.status, error.code); throw error }
  })
  return {
    'document/transcription/capabilities': { role: 'editor', handle: (request, ctx) => guarded(async () => {
      if (request.method !== 'GET') throw new RequestError(405, 'GET')
      return service.capabilities(ctx.document, ctx.member)
    }) },
    'document/transcription': { role: 'editor', maxBody: TRANSCRIPTION_REQUEST_MAX_BYTES, handle: (request, ctx) => guarded(async () => {
      if (request.method === 'GET') { const params = new URL(request.url).searchParams; params.delete('document'); return params.size ? service.get(ctx.document, query(Object.fromEntries(params)), ctx.member) : service.list(ctx.document, ctx.member) }
      if (request.method !== 'POST') throw new RequestError(405, 'GET or POST')
      return service.start(ctx.document, await request.json().catch(() => undefined), ctx.member, request.signal)
    }) },
    'document/transcription/result': { role: 'editor', handle: (request, ctx) => guarded(async () => {
      if (request.method !== 'GET') throw new RequestError(405, 'GET')
      const params = new URL(request.url).searchParams
      return service.readResult(ctx.document, params.get('id') ?? '', params.get('revision') ?? '', ctx.member)
    }) },
    'document/transcription/cancel': { role: 'editor', maxBody: 4 << 10, handle: (request, ctx) => guarded(async () => {
      if (request.method !== 'POST') throw new RequestError(405, 'POST')
      return service.cancel(ctx.document, query(await request.json().catch(() => undefined)), ctx.member)
    }) },
  }
}
