import { basename, relative } from 'node:path'
import { errorMessage, remapWords } from '@lincyaw/kernel'
import type { IRDocument, SpeechService, SynthesisRequest, WordSpan, WrittenWord } from '@lincyaw/kernel'
import { irHash, plannedUtterances, referencedBlocks, SCRIPT_TRACK, scriptTrack, sectionHashes } from '../domain/index.ts'
import type { Clip, CutAnimation, LecturePlan, LectureTrack, LectureVoice, Voice } from '../domain/index.ts'
import type { DeckPlan } from './plan.ts'
import { deckPlan } from './plan.ts'

export interface SynthesisOptions {
  voice: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  alignByTranscription?: boolean
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
  const request: SynthesisRequest = {
    ...voice.engine ? { engine: voice.engine } : {},
    voice: voice.voice,
    text: said.spoken,
    lang: options.lang,
    ...voice.rate !== undefined ? { rate: voice.rate } : {},
    ...voice.style ? { style: voice.style } : {},
    ...options.lexicon ? { lexicon: options.lexicon } : {},
  }
  const synthesis = await speech.synthesize(request, signal)
  if (typeof synthesis.audio !== 'string') throw new Error('the Node speech service gave no file of its cache')
  const engineWords = synthesis.words?.length
    ? synthesis.words
    : await speech.alignWords?.(synthesis.key, { lang: options.lang, transcribe: options.alignByTranscription !== false }, signal)
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
  }
}

export function clipVoice(clips: Iterable<SynthesizedClip>, fallback: LectureVoice): Voice {
  const first = clips[Symbol.iterator]().next().value as SynthesizedClip | undefined
  return {
    kind: 'synthetic',
    engine: first?.engine ?? fallback.engine ?? '',
    ...first?.model ? { model: first.model } : {},
    voice: first?.voice ?? fallback.voice,
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
    try {
      clips.set(u.id, await synthesizeClip(speech, u, options, signal))
    } catch (error) {
      failures.push({ id: u.id, section: u.section, text: u.text, ...u.source ? { source: { file: u.source.file, line: u.source.line } } : {}, reason: errorMessage(error) })
    }
  })
  failures.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return { clips, failures }
}

export interface SynthesizedLecture {
  deck: DeckPlan
  track?: LectureTrack
  clips: Map<string, SynthesizedClip>
  failures: SynthesisFailure[]
  /** Where `{cue}next` moves on before an animation has played. */
  cuts: CutAnimation[]
}

export async function synthesizeLecture(doc: IRDocument, deckDir: string, speech: SpeechService, signal?: AbortSignal): Promise<SynthesizedLecture> {
  const deck = deckPlan(doc, deckDir)
  const clips = new Map<string, SynthesizedClip>()
  if (!deck.voice) return { deck, clips, failures: [], cuts: [] }
  const synthesized = await synthesizePlan(speech, deck.plan, { voice: deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {} }, signal)
  if (synthesized.failures.length > 0) return { deck, clips: synthesized.clips, failures: synthesized.failures, cuts: [] }
  const { track, cuts } = scriptTrack(deck.plan, synthesized.clips, {
    id: SCRIPT_TRACK,
    doc: relative(deckDir, doc.meta.entry) || doc.meta.entry,
    lang: deck.lang,
    ir: { hash: irHash(doc), sections: sectionHashes(doc) },
    voice: clipVoice(synthesized.clips.values(), deck.voice),
    gap: deck.gap,
  }, events => referencedBlocks(doc, events))
  return { deck, track, clips: synthesized.clips, failures: [], cuts }
}

export function synthesisFailureMessage(failure: SynthesisFailure): string {
  const text = failure.text.length > 40 ? `${failure.text.slice(0, 40)}…` : failure.text
  return `lecture ${SCRIPT_TRACK}: 「${text}」 (section ${failure.section}) could not be said from the synthesis cache nor synthesized: ${failure.reason}`
}
