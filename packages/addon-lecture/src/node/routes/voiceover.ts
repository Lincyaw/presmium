import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { errorMessage, isRecord, jsonResponse, resolvedVoice, speechEngineId, speechVoice, voiceTarget } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { IRDocument, Route, ServerContribution, SpeechService, SpeechVoice, Synthesis, SynthesisRequest, VoiceoverJob, VoiceoverSnapshot, VoicePreviewQuery, VoicePreviewQuote, VoiceScope, VoiceTarget } from '@lincyaw/kernel'
import { plannedUtterances } from '../../domain/index.ts'
import { latestDoc, lectureView } from '../latest-ir.ts'
import { deckPlan } from '../plan.ts'
import type { ServedDeck } from './served-deck.ts'
import { RouteRefusal } from './served-deck.ts'

type Unit = ReturnType<typeof plannedUtterances>[number]
interface Context { doc: IRDocument, revision: string, units: Unit[], lang: string, lexicon?: Record<string, string> }
interface ActiveJob { job: VoiceoverJob, controller: AbortController, finished: Promise<void> }

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validTarget = (value: unknown): value is VoiceTarget => isRecord(value) && typeof value.section === 'string' && Number.isSafeInteger(value.step) && (value.step as number) >= 0 && typeof value.binding === 'string'
const validScope = (value: unknown): value is VoiceScope => isRecord(value) && (value.kind === 'document' || value.kind === 'page' && typeof value.section === 'string' || value.kind === 'step' && validTarget(value.target) || value.kind === 'steps' && Array.isArray(value.targets) && value.targets.length > 0 && value.targets.length <= 500 && value.targets.every(validTarget))

function scoped(context: Context, scope: VoiceScope): Unit[] {
  if (scope.kind === 'document') return context.units
  if (scope.kind === 'page') {
    if (!context.doc.sections.some(section => section.id === scope.section)) throw new RouteRefusal(409, 'voice-target-changed')
    return context.units.filter(unit => unit.section === scope.section)
  }
  const targets = scope.kind === 'step' ? [scope.target] : scope.targets
  for (const at of targets) {
    const section = context.doc.sections.find(section => section.id === at.section)
    if (!section || at.step > section.steps || voiceTarget(section, at.step).binding !== at.binding) throw new RouteRefusal(409, 'voice-step-binding-stale')
    const setting = resolvedVoice(context.doc, section, at.step)
    if (!setting.editable) throw new RouteRefusal(409, `voice-${setting.reason}`)
  }
  return context.units.filter(unit => targets.some(at => unit.voiceTarget?.section === at.section && unit.voiceTarget.step === at.step && unit.voiceTarget.binding === at.binding))
}

function requestOf(context: Context, unit: Unit): SynthesisRequest {
  if (unit.voiceIssue || !unit.voice) throw new RouteRefusal(409, unit.voiceIssue ?? 'voice-unset')
  return { ...unit.voice, text: unit.spoken, lang: context.lang, ...context.lexicon ? { lexicon: context.lexicon } : {} }
}

/** Explicit author jobs populate the exact-request cache; reading tracks never starts these jobs. */
export function voiceoverRoutes(served: ServedDeck): ServerContribution {
  const jobs = new Map<string, ActiveJob>()
  let closed = false
  const context = (): Context => {
    const doc = latestDoc(served.deckDir)
    if (!doc) throw new RouteRefusal(503, 'voice-document-unavailable')
    const deck = deckPlan(lectureView(doc), served.deckDir)
    return { doc, revision: irRevision(doc), units: plannedUtterances(deck.plan), lang: deck.lang, lexicon: deck.lexicon }
  }
  const same = (now: Context) => latestDoc(served.deckDir) === now.doc
  const assertRevision = (revision: unknown): Context => {
    const now = context()
    if (revision !== now.revision) throw new RouteRefusal(409, 'voice-revision-changed')
    return now
  }
  const engines = async (speech: SpeechService) => (await speech.engines()).filter(engine => engine.tts)
  const providerFor = async (speech: SpeechService, voice: SpeechVoice, now: Context, signal?: AbortSignal) => {
    const list = await engines(speech)
    const preferred = voice.engine ?? await speech.defaultSynthesisEngine?.()
    const engine = preferred ? list.find(engine => engine.id === speechEngineId(preferred)) : undefined
    if (!engine) throw new RouteRefusal(503, 'voice-not-configured')
    const catalog = await speech.voiceCatalog?.(engine.id, undefined, signal)
    if (catalog?.status !== 'available') throw new RouteRefusal(409, 'voice-catalog-unavailable')
    const chosen = catalog.voices.find(candidate => candidate.id === voice.voice)
    if (!chosen || chosen.lang.length && !chosen.lang.some(lang => lang.toLowerCase().split('-')[0] === now.lang.toLowerCase().split('-')[0])) throw new RouteRefusal(409, 'voice-unavailable')
    return engine
  }
  const snapshot = async (signal: AbortSignal): Promise<VoiceoverSnapshot> => {
    const now = context()
    let speech: SpeechService | undefined
    try { speech = served.speech() } catch { /* Readability and editing remain available without speech. */ }
    const providers = speech ? await engines(speech) : []
    const defaultEngine = await speech?.defaultSynthesisEngine?.()
    const cached = new Map<string, boolean>()
    const unavailable = new Map<string, string>()
    const usable = new Set<string>()
    await Promise.all(now.units.map(async unit => {
      if (!speech || !unit.voice || unit.voiceIssue) return
      try {
        const hit = Boolean(await speech.lookup?.(requestOf(now, unit), signal))
        cached.set(unit.id, hit)
        if (!hit) await providerFor(speech, unit.voice, now, signal)
        usable.add(unit.id)
      } catch (error) { unavailable.set(unit.id, errorMessage(error)) }
    }))
    if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
    const steps = now.doc.sections.flatMap(section => Array.from({ length: section.steps + 1 }, (_, step) => {
      const selected = resolvedVoice(now.doc, section, step)
      const units = now.units.filter(unit => unit.voiceTarget?.section === section.id && unit.voiceTarget.step === step)
      const count = units.filter(unit => cached.get(unit.id)).length
      const reason = units.find(unit => unit.voiceIssue)?.voiceIssue ?? units.map(unit => unavailable.get(unit.id)).find(Boolean) ?? (units.length > 0 && !selected.voice ? 'voice-unset' : undefined)
      return { target: selected.target, state: reason ? 'blocked' as const : units.length === 0 ? 'empty' as const : count === units.length ? 'ready' as const : 'missing' as const, utterances: units.length, cached: count, ...reason ? { reason } : {} }
    }))
    const unboundByPage = now.doc.sections.flatMap(section => {
      const units = now.units.filter(unit => !unit.voiceTarget && unit.section === section.id)
      if (!units.length) return []
      const count = units.filter(unit => cached.get(unit.id)).length
      const reason = units.find(unit => unit.voiceIssue)?.voiceIssue ?? units.map(unit => unavailable.get(unit.id)).find(Boolean)
      return [{ section: section.id, state: reason ? 'blocked' as const : count === units.length ? 'ready' as const : 'missing' as const, utterances: units.length, cached: count, ...reason ? { reason } : {} }]
    })
    return { revision: now.revision, capability: { available: Boolean(speech && usable.size), providers, ...defaultEngine ? { defaultEngine } : {}, ...!speech ? { reason: 'speech-unavailable' as const } : !usable.size && unavailable.size ? { reason: [...unavailable.values()].some(reason => reason === 'voice-not-configured') ? 'not-configured' as const : [...unavailable.values()].some(reason => reason === 'voice-catalog-unavailable') ? 'catalog-unavailable' as const : 'voice-unavailable' as const } : !usable.size ? { reason: 'voice-unset' as const } : {} }, steps, unboundByPage, jobs: [...jobs.values()].map(entry => ({ ...entry.job })) }
  }

  const run = async (entry: ActiveJob, now: Context, units: Unit[], issues: Map<string, string>) => {
    const { job, controller } = entry
    if (job.state !== 'queued') return
    job.state = 'running'
    try {
      const speech = served.speech()
      let yielded = performance.now()
      for (const unit of units) {
        controller.signal.throwIfAborted()
        if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
        try {
          if (issues.has(unit.id)) throw new Error(issues.get(unit.id))
          const request = requestOf(now, unit)
          if (!await speech.lookup?.(request, controller.signal)) {
            await providerFor(speech, unit.voice!, now, controller.signal)
            await speech.synthesize(request, controller.signal)
          }
          controller.signal.throwIfAborted()
          if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
          job.completed++
        } catch (error) {
          if (controller.signal.aborted || !same(now)) throw error
          job.failed++
          job.error = errorMessage(error)
        }
        if (performance.now() - yielded >= 8) { await setImmediate(); yielded = performance.now() }
      }
      job.state = job.failed ? 'failed' : 'done'
    } catch (error) {
      job.state = !same(now) ? 'stale' : controller.signal.aborted ? 'cancelled' : 'failed'
      if (job.state !== 'cancelled') job.error = errorMessage(error)
    } finally { job.finishedAt = new Date().toISOString() }
  }

  const quote = async (query: VoicePreviewQuery, signal: AbortSignal): Promise<{ quote: VoicePreviewQuote, request: SynthesisRequest, hit?: Synthesis, context: Context }> => {
    const now = assertRevision(query.revision), voice = speechVoice(query.voice)
    if (!voice) throw new RouteRefusal(400, 'voice-preview-invalid')
    let text = now.lang.toLowerCase().startsWith('en') ? 'Hello. This is a short voice preview for your presentation.' : '你好，这是一段配音试听。你可以用它比较音色，再选择文稿的旁白声音。'
    if (query.mode === 'step') {
      if (!validTarget(query.target)) throw new RouteRefusal(400, 'voice-target')
      text = scoped(now, { kind: 'step', target: query.target }).map(unit => unit.spoken).join('\n\n')
      if (!text.trim()) throw new RouteRefusal(409, 'voice-script-empty')
    }
    if (text.length > 2000) throw new RouteRefusal(413, 'voice-preview-too-long')
    const speech = served.speech(), available = await engines(speech)
    const preferred = voice.engine ?? await speech.defaultSynthesisEngine?.()
    const engine = preferred ? available.find(engine => engine.id === speechEngineId(preferred)) : undefined
    const request = { ...voice, ...engine ? { engine: engine.id } : {}, text, lang: now.lang, ...now.lexicon ? { lexicon: now.lexicon } : {} }
    const hit = await speech.lookup?.(request, signal)
    if (!engine && !hit) throw new RouteRefusal(503, 'voice-not-configured')
    if (!hit) await providerFor(speech, voice, now, signal)
    if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
    const provider = hit?.provider ?? engine!.provider, local = Boolean(hit || engine?.local)
    const token = digest({ revision: now.revision, request, provider, local, target: query.target, mode: query.mode })
    return { quote: { ...query, voice, text, provider, local, cached: Boolean(hit), quote: token }, request, hit, context: now }
  }

  const route = (handle: (request: Request) => Promise<Response>): Route => ({ role: 'editor', maxBody: 64 << 10, async handle(request) {
    try { return await handle(request) } catch (error) { return jsonResponse({ error: errorMessage(error) }, error instanceof RouteRefusal ? error.status : 502) }
  } })
  return {
    routes: {
      'voiceover': route(async request => {
        if (request.method === 'GET') return jsonResponse(await snapshot(request.signal))
        if (request.method !== 'POST') throw new RouteRefusal(405, 'GET or POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.revision !== 'string' || !validScope(body.scope)) throw new RouteRefusal(400, 'voice-generation-invalid')
        if (body.confirmed !== true) throw new RouteRefusal(409, 'voice-confirmation-required')
        if (closed) throw new RouteRefusal(503, 'voice-service-closing')
        const now = assertRevision(body.revision), units = scoped(now, body.scope)
        if (!units.length) throw new RouteRefusal(409, 'voice-script-empty')
        const speech = served.speech()
        const issues = new Map<string, string>()
        for (const unit of units) {
          try { if (!await speech.lookup?.(requestOf(now, unit), request.signal)) await providerFor(speech, unit.voice!, now, request.signal) }
          catch (error) { issues.set(unit.id, errorMessage(error)) }
        }
        if (issues.size === units.length) throw new RouteRefusal(409, issues.values().next().value ?? 'voice-unavailable')
        if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
        const matching = [...jobs.values()].find(entry => entry.job.revision === now.revision && JSON.stringify(entry.job.scope) === JSON.stringify(body.scope) && ['queued', 'running', 'cancelling'].includes(entry.job.state))
        if (matching) return jsonResponse(matching.job)
        const job: VoiceoverJob = { id: randomUUID(), revision: now.revision, scope: body.scope, state: 'queued', total: units.length, completed: 0, failed: 0, createdAt: new Date().toISOString() }
        const entry: ActiveJob = { job, controller: new AbortController(), finished: Promise.resolve() }
        jobs.set(job.id, entry)
        entry.finished = Promise.resolve().then(() => run(entry, now, units, issues))
        for (const [id, old] of jobs) if (jobs.size > 20 && !['queued', 'running', 'cancelling'].includes(old.job.state)) jobs.delete(id)
        return jsonResponse({ ...job }, 202)
      }),
      'voiceover/cancel': route(async request => {
        if (request.method !== 'POST') throw new RouteRefusal(405, 'POST')
        const body: unknown = await request.json().catch(() => undefined)
        const entry = isRecord(body) && typeof body.id === 'string' ? jobs.get(body.id) : undefined
        if (!entry) throw new RouteRefusal(404, 'voice-job-unknown')
        if (['queued', 'running'].includes(entry.job.state)) {
          const queued = entry.job.state === 'queued'
          entry.job.state = queued ? 'cancelled' : 'cancelling'
          if (queued) entry.job.finishedAt = new Date().toISOString()
          entry.controller.abort(new Error('voice-cancelled'))
        }
        return jsonResponse({ ...entry.job })
      }),
      'voice-preview': route(async request => {
        if (request.method === 'GET') {
          const params = new URL(request.url).searchParams
          let voice: unknown, target: unknown
          try { voice = JSON.parse(params.get('voice') ?? 'null'); target = JSON.parse(params.get('target') ?? 'null') } catch { throw new RouteRefusal(400, 'voice-preview-invalid') }
          const mode = params.get('mode'), revision = params.get('revision')
          if (!revision || mode !== 'sample' && mode !== 'step' || !speechVoice(voice) || target !== null && !validTarget(target)) throw new RouteRefusal(400, 'voice-preview-invalid')
          return jsonResponse((await quote({ revision, voice: speechVoice(voice)!, mode, ...target ? { target } : {} }, request.signal)).quote)
        }
        if (request.method !== 'POST') throw new RouteRefusal(405, 'GET or POST')
        const body: unknown = await request.json().catch(() => undefined)
        if (!isRecord(body) || typeof body.revision !== 'string' || !speechVoice(body.voice) || body.mode !== 'sample' && body.mode !== 'step' || body.target !== undefined && !validTarget(body.target)) throw new RouteRefusal(400, 'voice-preview-invalid')
        if (body.confirmed !== true) throw new RouteRefusal(409, 'voice-confirmation-required')
        const queried = await quote({ revision: body.revision, voice: speechVoice(body.voice)!, mode: body.mode, ...body.target ? { target: body.target as VoiceTarget } : {} }, request.signal)
        if (body.quote !== queried.quote.quote) throw new RouteRefusal(409, 'voice-preview-changed')
        const result = queried.hit ?? await served.speech().synthesize(queried.request, request.signal)
        if (!same(queried.context)) throw new RouteRefusal(409, 'voice-revision-changed')
        const bytes = typeof result.audio === 'string' ? await readFile(result.audio) : Buffer.from(await result.audio.arrayBuffer())
        if (bytes.byteLength > 8 << 20) throw new RouteRefusal(413, 'voice-preview-too-large')
        return jsonResponse({ revision: body.revision, voice: queried.quote.voice, text: queried.quote.text, cached: Boolean(queried.hit), key: result.key, audio: `data:${result.mime};base64,${bytes.toString('base64')}`, duration: result.duration, provider: result.provider })
      }),
    },
    async close() {
      closed = true
      for (const entry of jobs.values()) if (['queued', 'running', 'cancelling'].includes(entry.job.state)) {
        const queued = entry.job.state === 'queued'
        entry.job.state = queued ? 'cancelled' : 'cancelling'
        if (queued) entry.job.finishedAt = new Date().toISOString()
        entry.controller.abort(new Error('voice-service-closing'))
      }
      await Promise.all([...jobs.values()].map(entry => entry.finished))
    },
  }
}
