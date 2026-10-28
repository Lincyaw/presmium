import { createHash, randomUUID } from 'node:crypto'
import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { VOICEOVER_JOB_QUERY_SCHEMA, VOICEOVER_START_SCHEMA, VOICEOVER_STATUS_SCHEMA, VOICE_PREVIEW_CHECK_SCHEMA, VOICE_PREVIEW_START_SCHEMA } from '../contracts/voiceover-execution.ts'
import type { VoiceoverExecution, VoiceoverJobQuery, VoiceoverObservation, VoiceoverStart, VoiceoverStatusQuery, VoicePreviewCheck, VoicePreviewResource, VoicePreviewResourceData, VoicePreviewStart } from '../contracts/voiceover-execution.ts'
import type { CanonicalSource } from '../ir.ts'
import type { VoiceoverCancellation, VoiceoverJob, VoicePreviewQuote } from '../contracts/voice.ts'

const validator = <T>(schema: unknown) => { const checked = new Validator(structuredClone(schema) as Schema, '2020-12', false); return (value: unknown): value is T => checked.validate(value).valid }
export const validateVoiceoverStart = validator<VoiceoverStart>(VOICEOVER_START_SCHEMA)
export const validateVoiceoverStatus = validator<VoiceoverStatusQuery>(VOICEOVER_STATUS_SCHEMA)
export const validateVoiceoverJobQuery = validator<VoiceoverJobQuery>(VOICEOVER_JOB_QUERY_SCHEMA)
export const validateVoicePreviewCheck = validator<VoicePreviewCheck>(VOICE_PREVIEW_CHECK_SCHEMA)
export const validateVoicePreviewStart = validator<VoicePreviewStart>(VOICE_PREVIEW_START_SCHEMA)
export class VoiceoverOperationError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
type Load = (source: CanonicalSource | undefined, signal: AbortSignal) => Promise<VoiceoverExecution>
interface ActiveJob { job: VoiceoverJob, controller: AbortController }
interface Intent { payload?: string, controller: AbortController, job?: ActiveJob, state: 'preparing' | 'cancelled' | 'failed', error?: string, finished: Promise<void>, finish(): void }
const MAX_INTENTS = 1024, RECENT_JOBS = 20, MAX_OPERATIONS = 4, MAX_QUOTES = 64, QUOTE_MS = 120_000, MAX_PREVIEWS = 8, MAX_MEDIA_BYTES = 16 << 20
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const targetKey = (target: { section: string, step: number, binding: string }) => [target.section, target.step, target.binding]
const sourceKey = (source?: CanonicalSource) => source && [source.documentId, source.version, source.fingerprint]
const startPayload = (request: VoiceoverStart) => digest([request.revision, sourceKey(request.source), request.scope.kind, request.scope.kind === 'page' ? request.scope.section : request.scope.kind === 'step' ? targetKey(request.scope.target) : request.scope.kind === 'steps' ? [...new Set(request.scope.targets.map(target => JSON.stringify(targetKey(target))))].sort() : []])
const previewPayload = (request: VoicePreviewCheck) => digest([sourceKey(request.source), request.revision, request.voice.engine, request.voice.voice, request.voice.rate, request.voice.style, request.mode, request.target && targetKey(request.target)])

/** The existing in-process intent/job coordinator, shared by Workspace and standalone lecture servers. */
export function createVoiceoverOwner() {
  const jobs = new Map<string, ActiveJob>(), intents = new Map<string, Intent>()
  const operations = new Set<{ controller: AbortController, finished: Promise<unknown> }>()
  const quotes = new Map<string, { value: VoicePreviewQuote, underlying: string, execution: VoiceoverExecution, expires: number }>()
  const media = new Map<string, VoicePreviewResourceData>()
  let closed = false
  const available = () => { if (closed) throw new VoiceoverOperationError(503, 'voice-service-closing') }
  const work = <T>(signal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    available(); signal?.throwIfAborted()
    if (operations.size >= MAX_OPERATIONS) throw new VoiceoverOperationError(503, 'voice-authoring-busy')
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const operation = { controller, finished: Promise.resolve() as Promise<unknown> }
    operations.add(operation)
    const finished = Promise.resolve().then(() => { available(); combined.throwIfAborted(); return run(combined) }).catch(error => { if (closed) throw new VoiceoverOperationError(503, 'voice-service-closing'); throw error }).finally(() => operations.delete(operation))
    operation.finished = finished
    return finished
  }
  const patch = (job: VoiceoverJob, value: Partial<VoiceoverJob>) => {
    if (Object.entries(value).some(([key, value]) => job[key as keyof VoiceoverJob] !== value)) { Object.assign(job, value); job.sequence++ }
  }
  const newIntent = (id: string, payload?: string): Intent => {
    if (intents.size >= MAX_INTENTS) throw new VoiceoverOperationError(503, 'voice-intent-capacity')
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    const intent: Intent = { payload, controller: new AbortController(), state: 'preparing', finished, finish }
    intents.set(id, intent)
    return intent
  }
  const cancelJob = (entry: ActiveJob) => {
    if (entry.job.state === 'queued' || entry.job.state === 'running') {
      const queued = entry.job.state === 'queued'
      patch(entry.job, { state: queued ? 'cancelled' : 'cancelling', ...queued ? { finishedAt: new Date().toISOString() } : {} })
      entry.controller.abort(new Error('voice-cancelled'))
    }
  }
  const find = (query: VoiceoverJobQuery): Intent | undefined => 'intent' in query ? intents.get(query.intent) : [...intents.values()].find(intent => intent.job?.job.id === query.id)
  const observation = (id: string, intent: Intent): VoiceoverObservation => ({ intent: id, state: intent.job?.job.state ?? (intent.state === 'preparing' ? 'queued' : intent.state), ...intent.job ? { job: structuredClone(intent.job.job) } : {}, ...intent.error ? { error: intent.error } : {} })
  return {
    limits: { intents: MAX_INTENTS, recentJobs: RECENT_JOBS, concurrent: MAX_OPERATIONS, quotes: MAX_QUOTES, quoteLifetimeMs: QUOTE_MS, previewBytes: 8 << 20, previewResources: MAX_PREVIEWS, retainedPreviewBytes: MAX_MEDIA_BYTES },
    snapshot(query: VoiceoverStatusQuery, load: Load, signal?: AbortSignal) {
      if (!validateVoiceoverStatus(query)) throw new VoiceoverOperationError(400, 'voice-status-invalid')
      return work(signal, async signal => { const execution = await load(query.source, signal), status = await execution.status(query, signal); signal.throwIfAborted(); return { ...status, jobs: [...jobs.values()].map(entry => structuredClone(entry.job)) } })
    },
    list() { available(); return [...jobs.values()].map(entry => structuredClone(entry.job)) },
    get(query: VoiceoverJobQuery): VoiceoverObservation {
      available()
      if (!validateVoiceoverJobQuery(query)) throw new VoiceoverOperationError(400, 'voice-job-query-invalid')
      const intent = find(query)
      if (!intent) throw new VoiceoverOperationError(404, 'voice-job-unknown')
      return observation('intent' in query ? query.intent : intent.job!.job.intent, intent)
    },
    cancel(query: VoiceoverJobQuery): VoiceoverCancellation {
      available()
      if (!validateVoiceoverJobQuery(query)) throw new VoiceoverOperationError(400, 'voice-cancel-invalid')
      const intent = 'intent' in query ? intents.get(query.intent) ?? newIntent(query.intent) : find(query)
      if (!intent) throw new VoiceoverOperationError(404, 'voice-job-unknown')
      if (intent.job) cancelJob(intent.job)
      else { intent.state = 'cancelled'; intent.controller.abort(new Error('voice-cancelled')); if (!intent.payload) intent.finish() }
      return observation('intent' in query ? query.intent : intent.job!.job.intent, intent)
    },
    /** Cancellation that would change nothing (the job or intent already ended) is answered here, without asking. */
    checkCancel(query: VoiceoverJobQuery): VoiceoverCancellation | undefined {
      available()
      if (!validateVoiceoverJobQuery(query)) throw new VoiceoverOperationError(400, 'voice-cancel-invalid')
      const intent = find(query)
      if (!intent) { if ('intent' in query) return undefined; throw new VoiceoverOperationError(404, 'voice-job-unknown') }
      const state = intent.job?.job.state ?? intent.state
      return state === 'queued' || state === 'running' || state === 'preparing' ? undefined : observation('intent' in query ? query.intent : intent.job!.job.intent, intent)
    },
    /** The same admission as start, released at once: a request that passes would be admitted unless the document changes. */
    checkStart(request: VoiceoverStart, load: Load, signal?: AbortSignal): Promise<void> {
      if (!validateVoiceoverStart(request)) throw new VoiceoverOperationError(400, 'voice-generation-invalid')
      return work(signal, async signal => {
        const known = intents.get(request.intent)
        if (known?.payload && known.payload !== startPayload(request)) throw new VoiceoverOperationError(409, 'voice-intent-changed')
        if (known?.job) return
        if (known?.state === 'cancelled') throw new VoiceoverOperationError(409, 'voice-cancelled')
        if (known?.state === 'failed') throw new VoiceoverOperationError(409, 'voice-intent-failed')
        if (known) throw new VoiceoverOperationError(409, 'voice-job-busy')
        const execution = await load(request.source, signal)
        ;(await execution.prepare(structuredClone(request), signal)).dispose()
      })
    },
    checkPreview(request: VoicePreviewStart, signal?: AbortSignal): Promise<void> {
      if (!validateVoicePreviewStart(request)) throw new VoiceoverOperationError(400, 'voice-preview-invalid')
      return work(signal, async signal => {
        const quoted = quotes.get(request.quote)
        if (!quoted || quoted.expires < Date.now() || previewPayload(quoted.value) !== previewPayload(request)) throw new VoiceoverOperationError(409, 'voice-preview-changed')
        const { quote: _, ...check } = request
        if ((await quoted.execution.quote(check, signal)).quote !== quoted.underlying) throw new VoiceoverOperationError(409, 'voice-preview-changed')
      })
    },
    start(request: VoiceoverStart, load: Load, signal?: AbortSignal): Promise<VoiceoverJob> {
      if (!validateVoiceoverStart(request)) throw new VoiceoverOperationError(400, 'voice-generation-invalid')
      request = structuredClone(request)
      return work(signal, async signal => {
        const payload = startPayload(request), known = intents.get(request.intent)
        if (known?.payload && known.payload !== payload) throw new VoiceoverOperationError(409, 'voice-intent-changed')
        if (known?.job) return structuredClone(known.job.job)
        if (known?.state === 'cancelled') throw new VoiceoverOperationError(409, 'voice-cancelled')
        if (known?.state === 'failed') throw new VoiceoverOperationError(409, 'voice-intent-failed')
        if (known) throw new VoiceoverOperationError(409, 'voice-job-busy')
        const intent = newIntent(request.intent, payload), combined = AbortSignal.any([signal, intent.controller.signal])
        let prepared: Awaited<ReturnType<VoiceoverExecution['prepare']>> | undefined, admitted = false
        try {
          combined.throwIfAborted()
          const execution = await load(request.source, combined)
          combined.throwIfAborted(); prepared = await execution.prepare(request, combined); combined.throwIfAborted(); available()
          const job: VoiceoverJob = { id: randomUUID(), sequence: 1, intent: request.intent, source: prepared.source, revision: prepared.revision, scope: prepared.scope, state: 'queued', total: prepared.total, completed: 0, failed: 0, createdAt: new Date().toISOString() }
          const entry = { job, controller: intent.controller }, task = prepared
          intent.job = entry; jobs.set(job.id, entry); admitted = true
          void Promise.resolve().then(async () => {
            if (job.state !== 'queued') return
            patch(job, { state: 'running', startedAt: new Date().toISOString() })
            try { const result = await task.run(intent.controller.signal, progress => patch(job, progress)); patch(job, { ...result, finishedAt: new Date().toISOString() }) }
            catch (error) { patch(job, { state: intent.controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() }) }
          }).finally(() => { task.dispose(); intent.finish() })
          for (const [id, old] of jobs) if (jobs.size > RECENT_JOBS && !['queued', 'running', 'cancelling'].includes(old.job.state)) jobs.delete(id)
          return structuredClone(job)
        } catch (error) {
          const intentCancelled = intent.controller.signal.aborted
          intent.state = combined.aborted ? 'cancelled' : 'failed'; intent.error = error instanceof Error ? error.message : String(error)
          intent.controller.abort(error)
          if (closed) throw new VoiceoverOperationError(503, 'voice-service-closing')
          if (intentCancelled) throw new VoiceoverOperationError(409, 'voice-cancelled')
          throw error
        } finally { if (!admitted) { prepared?.dispose(); intent.finish() } }
      })
    },
    quote(query: VoicePreviewCheck, load: Load, signal?: AbortSignal): Promise<VoicePreviewQuote> {
      if (!validateVoicePreviewCheck(query)) throw new VoiceoverOperationError(400, 'voice-preview-invalid')
      return work(signal, async signal => {
        const execution = await load(query.source, signal), quoted = await execution.quote(query, signal)
        signal.throwIfAborted(); available()
        const token = digest([randomUUID(), quoted.quote]), value = { ...quoted, quote: token }
        quotes.set(token, { value, underlying: quoted.quote, execution, expires: Date.now() + QUOTE_MS })
        while (quotes.size > MAX_QUOTES) quotes.delete(quotes.keys().next().value!)
        return structuredClone(value)
      })
    },
    preview(request: VoicePreviewStart, signal?: AbortSignal): Promise<VoicePreviewResource> {
      if (!validateVoicePreviewStart(request)) throw new VoiceoverOperationError(400, 'voice-preview-invalid')
      return work(signal, async signal => {
        const quoted = quotes.get(request.quote)
        if (!quoted || quoted.expires < Date.now() || previewPayload(quoted.value) !== previewPayload(request)) throw new VoiceoverOperationError(409, 'voice-preview-changed')
        const value = await quoted.execution.preview({ ...request, quote: quoted.underlying }, signal)
        signal.throwIfAborted(); available()
        if (value.bytes.byteLength > 8 << 20) throw new VoiceoverOperationError(413, 'voice-preview-too-large')
        const { bytes, ...answer } = value, resource: VoicePreviewResource = { ...answer, id: randomUUID(), byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }
        media.set(resource.id, { resource, bytes: new Uint8Array(bytes) })
        while (media.size > MAX_PREVIEWS || [...media.values()].reduce((sum, value) => sum + value.bytes.byteLength, 0) > MAX_MEDIA_BYTES) media.delete(media.keys().next().value!)
        return structuredClone(resource)
      })
    },
    readPreview(id: string): VoicePreviewResourceData {
      available()
      const value = media.get(id)
      if (!value) throw new VoiceoverOperationError(404, 'voice-preview-resource-unknown')
      return { resource: structuredClone(value.resource), bytes: new Uint8Array(value.bytes) }
    },
    async close() {
      closed = true
      for (const operation of operations) operation.controller.abort(new Error('voice-service-closing'))
      for (const intent of intents.values()) { if (intent.job) cancelJob(intent.job); else intent.controller.abort(new Error('voice-service-closing')) }
      await Promise.allSettled([...operations].map(operation => operation.finished))
      await Promise.allSettled([...intents.values()].map(intent => intent.finished))
      quotes.clear(); media.clear()
    },
  }
}
