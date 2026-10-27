import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { errorMessage, isRecord, resolvedVoice, speechEngineId, speechVoice, voiceTarget } from '@lincyaw/kernel'
import { irRevision, VoiceoverOperationError } from '@lincyaw/kernel/node'
import type { CanonicalSource, IRDocument, NodeServiceContext, SpeechService, SpeechVoice, Synthesis, SynthesisRequest, VoiceoverExecution, VoiceoverProgress, VoiceoverRunResult, VoiceoverSnapshot, VoiceoverStatusQuery, VoicePreviewQuery, VoicePreviewQuote, VoiceScope, VoiceTarget } from '@lincyaw/kernel'
import { plannedUtterances } from '../domain/index.ts'
import { latestDoc, lectureView } from './latest-ir.ts'
import { deckPlan } from './plan.ts'
import { claimVoiceGeneration, VoiceGenerationBusy } from './voice-generation.ts'
import { assertVoiceSource, VoiceSourceRefusal } from './voice-source.ts'
import { createServedDeck, RouteRefusal } from './routes/served-deck.ts'

type Unit = ReturnType<typeof plannedUtterances>[number]
interface Context { source: CanonicalSource, doc: IRDocument, revision: string, units: Unit[], lang: string, lexicon?: Record<string, string> }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validTarget = (value: unknown): value is VoiceTarget => isRecord(value) && typeof value.section === 'string' && Number.isSafeInteger(value.step) && (value.step as number) >= 0 && typeof value.binding === 'string'

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


/** Real lecture execution; the shared host owner retains all jobs and intents. */
export function voiceoverExecution(ctx: NodeServiceContext): VoiceoverExecution {
  const served = createServedDeck({ ...ctx, service: token => ctx.service?.(token) })
  const context = async (expected?: CanonicalSource): Promise<Context> => {
    const doc = latestDoc(served.deckDir)
    if (!doc) throw new RouteRefusal(503, 'voice-document-unavailable')
    const source = await assertVoiceSource(doc, served.deckDir, expected)
    if (latestDoc(served.deckDir) !== doc) throw new RouteRefusal(409, 'voice-revision-changed')
    const deck = deckPlan(lectureView(doc))
    return { source, doc, revision: irRevision(doc), units: plannedUtterances(deck.plan), lang: deck.lang, lexicon: deck.lexicon }
  }
  const same = (now: Context) => latestDoc(served.deckDir) === now.doc
  const assertCurrent = async (now: Context) => {
    if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
    await assertVoiceSource(now.doc, served.deckDir, now.source)
    if (!same(now)) throw new RouteRefusal(409, 'voice-revision-changed')
  }
  const stale = (error: unknown) => error instanceof VoiceSourceRefusal || error instanceof RouteRefusal && error.message === 'voice-revision-changed'
  const assertRevision = async (revision: unknown, expected?: CanonicalSource): Promise<Context> => {
    const now = await context(expected)
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
  const snapshot = async (query: VoiceoverStatusQuery, signal: AbortSignal): Promise<Omit<VoiceoverSnapshot, 'jobs'>> => {
    const now = await context(query.source)
    if (query.revision !== undefined && query.revision !== now.revision) throw new RouteRefusal(409, 'voice-revision-changed')
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
    await assertCurrent(now)
    const steps = now.doc.sections.flatMap(section => Array.from({ length: section.steps + 1 }, (_, step) => {
      const selected = resolvedVoice(now.doc, section, step)
      const units = now.units.filter(unit => unit.voiceTarget?.section === section.id && unit.voiceTarget.step === step)
      const count = units.filter(unit => cached.get(unit.id)).length
      const reason = units.find(unit => unit.voiceIssue)?.voiceIssue ?? units.map(unit => unavailable.get(unit.id)).find(Boolean) ?? (units.length > 0 && !selected.voice ? 'voice-unset' : undefined)
      return { target: selected.target, ...section.stepIds?.[step] ? { stepId: section.stepIds[step] } : {}, state: reason ? 'blocked' as const : units.length === 0 ? 'empty' as const : count === units.length ? 'ready' as const : 'missing' as const, utterances: units.length, cached: count, ...reason ? { reason } : {} }
    }))
    const unboundByPage = now.doc.sections.flatMap(section => {
      const units = now.units.filter(unit => !unit.voiceTarget && unit.section === section.id)
      if (!units.length) return []
      const count = units.filter(unit => cached.get(unit.id)).length
      const reason = units.find(unit => unit.voiceIssue)?.voiceIssue ?? units.map(unit => unavailable.get(unit.id)).find(Boolean)
      return [{ section: section.id, state: reason ? 'blocked' as const : count === units.length ? 'ready' as const : 'missing' as const, utterances: units.length, cached: count, ...reason ? { reason } : {} }]
    })
    return { source: now.source, revision: now.revision, capability: { available: Boolean(speech && usable.size), providers, ...defaultEngine ? { defaultEngine } : {}, ...!speech ? { reason: 'speech-unavailable' as const } : !usable.size && unavailable.size ? { reason: [...unavailable.values()].some(reason => reason === 'voice-not-configured') ? 'not-configured' as const : [...unavailable.values()].some(reason => reason === 'voice-catalog-unavailable') ? 'catalog-unavailable' as const : 'voice-unavailable' as const } : !usable.size ? { reason: 'voice-unset' as const } : {} }, steps, unboundByPage }
  }

  const quote = async (query: VoicePreviewQuery, signal: AbortSignal, expected?: CanonicalSource): Promise<{ quote: VoicePreviewQuote, request: SynthesisRequest, hit?: Synthesis, context: Context }> => {
    const now = await assertRevision(query.revision, expected), voice = speechVoice(query.voice)
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
    await assertCurrent(now)
    const provider = hit?.provider ?? engine!.provider, local = Boolean(hit || engine?.local)
    const token = digest({ source: now.source, revision: now.revision, request, provider, local, target: query.target, mode: query.mode })
    return { quote: { ...query, source: now.source, voice, text, provider, local, cached: Boolean(hit), quote: token }, request, hit, context: now }
  }


  const guarded = async <T>(run: () => Promise<T>): Promise<T> => {
    try { return await run() }
    catch (error) {
      if (error instanceof VoiceSourceRefusal || error instanceof VoiceGenerationBusy) throw new VoiceoverOperationError(409, error.message)
      throw error
    }
  }
  return {
    status: (query, signal) => guarded(() => snapshot(query, signal)),
    prepare: (request, signal) => guarded(async () => {
      signal.throwIfAborted()
      const now = await assertRevision(request.revision, request.source), units = scoped(now, request.scope)
      signal.throwIfAborted()
      if (!units.length) throw new RouteRefusal(409, 'voice-script-empty')
      const release = claimVoiceGeneration(served.deckDir)
      try {
        const speech = served.speech(), issues = new Map<string, string>()
        for (const unit of units) {
          signal.throwIfAborted(); await assertCurrent(now); signal.throwIfAborted()
          try { if (!await speech.lookup?.(requestOf(now, unit), signal)) await providerFor(speech, unit.voice!, now, signal) }
          catch (error) { signal.throwIfAborted(); if (stale(error)) throw error; issues.set(unit.id, errorMessage(error)) }
          await assertCurrent(now)
        }
        signal.throwIfAborted()
        if (issues.size === units.length) throw new RouteRefusal(409, issues.values().next().value ?? 'voice-unavailable')
        return {
          source: now.source, revision: now.revision, scope: structuredClone(request.scope), total: units.length, dispose: release,
          async run(signal: AbortSignal, progress: (value: VoiceoverProgress) => void): Promise<VoiceoverRunResult> {
            let completed = 0, failed = 0, failure: string | undefined, yielded = performance.now()
            try {
              for (const unit of units) {
                signal.throwIfAborted(); await assertCurrent(now)
                try {
                  if (issues.has(unit.id)) throw new Error(issues.get(unit.id))
                  const request = requestOf(now, unit)
                  if (!await speech.lookup?.(request, signal)) {
                    await providerFor(speech, unit.voice!, now, signal)
                    await assertCurrent(now); signal.throwIfAborted()
                    await speech.synthesize(request, signal)
                  }
                  signal.throwIfAborted(); await assertCurrent(now); signal.throwIfAborted(); completed++
                } catch (error) {
                  if (signal.aborted || stale(error) || !same(now)) throw error
                  failed++; failure = errorMessage(error)
                }
                progress({ completed, failed, ...failure ? { error: failure } : {} })
                if (performance.now() - yielded >= 8) { await setImmediate(); yielded = performance.now() }
              }
              await assertCurrent(now); signal.throwIfAborted()
              return { state: failed ? 'failed' : 'done', completed, failed, ...failure ? { error: failure } : {} }
            } catch (error) {
              const state = stale(error) || !same(now) ? 'stale' : signal.aborted ? 'cancelled' : 'failed'
              return { state, completed, failed, ...state !== 'cancelled' ? { error: errorMessage(error) } : {} }
            }
          },
        }
      } catch (error) { release(); throw error }
    }),
    quote: (query, signal) => guarded(async () => (await quote(query, signal, query.source)).quote),
    preview: (request, signal) => guarded(async () => {
      const queried = await quote(request, signal, request.source)
      if (request.quote !== queried.quote.quote) throw new RouteRefusal(409, 'voice-preview-changed')
      const release = queried.hit ? undefined : claimVoiceGeneration(served.deckDir)
      try {
        signal.throwIfAborted(); await assertCurrent(queried.context); signal.throwIfAborted()
        const result = queried.hit ?? await served.speech().synthesize(queried.request, signal)
        await assertCurrent(queried.context)
        const bytes = typeof result.audio === 'string' ? await readFile(result.audio) : Buffer.from(await result.audio.arrayBuffer())
        if (bytes.byteLength > 8 << 20) throw new RouteRefusal(413, 'voice-preview-too-large')
        signal.throwIfAborted(); await assertCurrent(queried.context); signal.throwIfAborted()
        return { source: queried.context.source, revision: request.revision, voice: queried.quote.voice, text: queried.quote.text, cached: Boolean(queried.hit), key: result.key, bytes: new Uint8Array(bytes), mediaType: result.mime, duration: result.duration, provider: result.provider }
      } finally { release?.() }
    }),
  }
}
