import { basename, relative } from 'node:path'
import { errorMessage, remapWords } from '@lincyaw/kernel'
import type { IRDocument, SpeechService, SynthesisRequest, WordSpan, WrittenWord } from '@lincyaw/kernel'
import { irHash, plannedUtterances, referencedBlocks, SCRIPT_TRACK, scriptTrack, sectionHashes } from '../domain/index.ts'
import type { Clip, CutAnimation, LecturePlan, LectureTrack, LectureVoice, Voice } from '../domain/index.ts'
import type { DeckPlan } from './plan.ts'
import { deckPlan } from './plan.ts'

export interface SynthesisOptions {
  voice?: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  alignByTranscription?: boolean
  cacheOnly?: boolean
  /** Author generation verifies the canonical source; renderers omit this and remain IR/cache-only. */
  assertCurrent?: () => Promise<void>
}

export interface SynthesizedClip extends Clip {
  path: string
  key: string
  engine: string
  model: string
  voice: string
  provider: string
}

export async function synthesizeClip(speech: SpeechService, said: { text: string, spoken: string, spans: WordSpan[] }, options: SynthesisOptions, signal?: AbortSignal): Promise<SynthesizedClip> {
  const { voice } = options
  if (!voice) throw new Error('voice-unset')
  const request: SynthesisRequest = {
    ...voice.engine ? { engine: voice.engine } : {},
    voice: voice.voice,
    text: said.spoken,
    lang: options.lang,
    ...voice.rate !== undefined ? { rate: voice.rate } : {},
    ...voice.style ? { style: voice.style } : {},
    ...options.lexicon ? { lexicon: options.lexicon } : {},
  }
  const synthesis = options.cacheOnly ? await speech.lookup?.(request, signal) : await speech.synthesize(request, signal)
  if (!synthesis) throw new Error('voiceover is not generated for the current script and voice; generate it explicitly')
  if (typeof synthesis.audio !== 'string') throw new Error('the Node speech service gave no file of its cache')
  const engineWords = synthesis.words?.length
    ? synthesis.words
    : await speech.alignWords?.(synthesis.key, { lang: options.lang, transcribe: !options.cacheOnly && options.alignByTranscription !== false }, signal)
  const words: WrittenWord[] | undefined = engineWords && remapWords(engineWords, said.text, said.spoken, said.spans)
  return {
    file: basename(synthesis.audio),
    path: synthesis.audio,
    duration: synthesis.duration,
    ...words ? { words } : {},
    key: synthesis.key,
    engine: synthesis.engine,
    model: synthesis.model,
    voice: synthesis.voice,
    provider: synthesis.provider,
    speech: { kind: 'synthetic', engine: synthesis.engine, model: synthesis.model, voice: synthesis.voice, provider: synthesis.provider },
  }
}

export function clipVoice(clips: Iterable<SynthesizedClip>, fallback: LectureVoice | undefined): Voice {
  const first = clips[Symbol.iterator]().next().value as SynthesizedClip | undefined
  if (!first && !fallback) return { kind: 'silent' }
  return {
    kind: 'synthetic',
    engine: first?.engine ?? fallback?.engine ?? '',
    ...first?.model ? { model: first.model } : {},
    voice: first?.voice ?? fallback?.voice ?? '',
    ...first?.provider ? { provider: first.provider } : {},
  }
}

export interface SynthesisFailure {
  id: string
  section: string
  text: string
  source?: { file: string, line: number }
  reason: string
}

async function each<T>(items: readonly T[], work: (item: T) => Promise<void>, limit = 4): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}

export async function synthesizePlan(speech: SpeechService, plan: LecturePlan, options: SynthesisOptions, signal?: AbortSignal): Promise<{ clips: Map<string, SynthesizedClip>, failures: SynthesisFailure[] }> {
  const clips = new Map<string, SynthesizedClip>()
  const failures: SynthesisFailure[] = []
  await each(plannedUtterances(plan), async (u) => {
    if (u.sourceKind === 'none') return
    await options.assertCurrent?.()
    if (options.assertCurrent) signal?.throwIfAborted()
    try {
      signal?.throwIfAborted()
      if (u.voiceIssue) throw new Error(u.voiceIssue)
      const clip = await synthesizeClip(speech, u, { ...options, voice: u.voice ?? options.voice }, signal)
      await options.assertCurrent?.()
      if (options.assertCurrent) signal?.throwIfAborted()
      clips.set(u.id, clip)
    } catch (error) {
      await options.assertCurrent?.()
      if (options.assertCurrent) signal?.throwIfAborted()
      failures.push({ id: u.id, section: u.section, text: u.text, ...u.source ? { source: { file: u.source.file, line: u.source.line } } : {}, reason: errorMessage(error) })
    }
  }, options.assertCurrent ? 1 : 4)
  await options.assertCurrent?.()
  if (options.assertCurrent) signal?.throwIfAborted()
  failures.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return { clips, failures }
}

export interface SynthesizedLecture {
  deck: DeckPlan
  /** The lecture, every sentence said; none when one could not be. */
  track?: LectureTrack
  /** The lecture to play while some sentences could not be said: those are silent (`Utterance.unsaid`). */
  preview?: LectureTrack
  clips: Map<string, SynthesizedClip>
  failures: SynthesisFailure[]
  /** Where `{cue}next` moves on before an animation has played. */
  cuts: CutAnimation[]
}

export async function synthesizeLecture(doc: IRDocument, deckDir: string, speech: SpeechService | undefined, signal?: AbortSignal, options: Pick<SynthesisOptions, 'cacheOnly' | 'assertCurrent'> = {}): Promise<SynthesizedLecture> {
  const deck = deckPlan(doc)
  const clips = new Map<string, SynthesizedClip>()
  if (!options.cacheOnly && deck.findings.some(finding => finding.severity === 'error')) return { deck, clips, failures: [], cuts: [] }
  const units = plannedUtterances(deck.plan)
  const synthesized = speech ? await synthesizePlan(speech, deck.plan, { voice: deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {}, cacheOnly: options.cacheOnly, assertCurrent: options.assertCurrent }, signal) : { clips, failures: units.filter(unit => unit.sourceKind !== 'none').map(unit => ({ id: unit.id, section: unit.section, text: unit.text, reason: unit.voiceIssue ?? 'speech-unavailable' })) }
  const unsaid = new Map(synthesized.failures.map(failure => [failure.id, failure.reason]))
  const { track, cuts } = scriptTrack(deck.plan, synthesized.clips, {
    id: SCRIPT_TRACK,
    doc: relative(deckDir, doc.meta.entry) || doc.meta.entry,
    lang: deck.lang,
    ir: { hash: irHash(doc), sections: sectionHashes(doc) },
    voice: units.every(unit => unit.sourceKind === 'none') ? { kind: 'silent' } : clipVoice(units.flatMap(unit => synthesized.clips.get(unit.id) ?? []), deck.voice),
    gap: deck.gap,
  }, events => referencedBlocks(doc, events), unsaid, new Set(units.filter(unit => unit.sourceKind === 'none').map(unit => unit.id)))
  if (synthesized.failures.length > 0 || deck.findings.some(finding => finding.severity === 'error')) return { deck, preview: track, clips: synthesized.clips, failures: synthesized.failures, cuts: [] }
  return { deck, track, preview: track, clips: synthesized.clips, failures: [], cuts }
}

export function synthesisFailureMessage(failure: SynthesisFailure, cacheOnly = false): string {
  const text = failure.text.length > 40 ? `${failure.text.slice(0, 40)}…` : failure.text
  return `lecture ${SCRIPT_TRACK}: 「${text}」 (section ${failure.section}) ${cacheOnly ? 'has no usable voiceover in the synthesis cache' : 'could not be said from the synthesis cache nor synthesized'}: ${failure.reason}`
}
