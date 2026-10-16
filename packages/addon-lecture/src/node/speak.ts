/**
 * Speech for lectures through the Node `SPEECH` service (docs/architecture.md
 * 4.8), whose synthesis cache answers a clip it has without asking an
 * engine: the clips of a plan (the synthesized lecture), a recorded lecture
 * said again in another voice, and the transcript of a recorded lecture.
 * A clip's words come from the engine's word times; without them, from a
 * transcript of the clip, kept beside the clip in the synthesis cache
 * (`<key>.align.json`), so a build without engines gives the same lecture.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { SpeechService, SpeechWord, SynthesisRequest } from '@presmium/kernel'
import { plannedUtterances, writtenWords } from '../domain/index.ts'
import type { Clip, LecturePlan, LectureVoice, MediaSegment, PlacedWord, SegmentTranscript, Span, Voice } from '../domain/index.ts'

/** An engine id as the operator's variables name it: case and `-` or `_` do not matter. */
export function sameEngine(a: string, b: string): boolean {
  const id = (s: string) => s.trim().toLowerCase().replace(/-/g, '_')
  return id(a) === id(b)
}

export interface SpeakOptions {
  voice: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  /**
   * Only look things up: a clip without word times takes the words kept
   * beside it, and none when there are none, instead of a transcription.
   * (Whether the synthesis itself is a lookup is the caller's: it is when no
   * engine can synthesize the voice.)
   */
  lookup?: boolean
}

/** A synthesized clip, with what made it. */
export interface MadeClip extends Clip {
  key: string
  engine: string
  model: string
  voice: string
  /** The engine's provider, from the clip's record in the cache. */
  provider?: string
}

/** The record of a clip in the synthesis cache (docs/ir.md 9.1), when it is there. */
function record(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dirname(file), `${basename(file).replace(/\.\w+$/, '')}.json`), 'utf8'))
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

const MIME: Record<string, string> = { wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4' }

/** A file as the Blob a transcription takes. */
export function audioBlob(file: string): Blob {
  return new Blob([readFileSync(file)], { type: MIME[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream' })
}

/** The words of a clip without word times: a transcript of it, kept beside it (`<key>.align.json`); undefined when none can be made (or `lookup` and none is kept). */
async function alignedWords(speech: SpeechService, file: string, key: string, lang: string, lookup: boolean, signal?: AbortSignal): Promise<SpeechWord[] | undefined> {
  const kept = join(dirname(file), `${key}.align.json`)
  if (/^[0-9a-f]{32}$/.test(key) && existsSync(kept)) {
    try {
      const value: unknown = JSON.parse(readFileSync(kept, 'utf8'))
      if (isRecord(value) && Array.isArray(value.words)) return value.words as SpeechWord[]
    } catch {
      // Made again below.
    }
  }
  if (lookup) return undefined
  try {
    const transcript = await speech.transcribe({ audio: audioBlob(file), lang }, signal)
    const words = transcript.segments.flatMap(s => s.words)
    if (words.length === 0) return undefined
    const temporary = `${kept}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ key, words }, null, 2)}\n`)
    renameSync(temporary, kept)
    return words
  } catch {
    return undefined
  }
}

/** Synthesizes a text (shown as `text`, said as `spoken`), with its words in the shown text. */
export async function synthesizeClip(speech: SpeechService, said: { text: string, spoken: string, spans: Span[] }, options: SpeakOptions, signal?: AbortSignal): Promise<MadeClip> {
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
  const engineWords = synthesis.words?.length ? synthesis.words : await alignedWords(speech, synthesis.audio, synthesis.key, options.lang, Boolean(options.lookup), signal)
  const words: PlacedWord[] | undefined = engineWords && writtenWords(engineWords, said.text, said.spoken, said.spans)
  const provider = record(synthesis.audio)?.provider
  return {
    file: basename(synthesis.audio),
    duration: synthesis.duration,
    ...words ? { words } : {},
    key: synthesis.key,
    engine: synthesis.engine,
    model: synthesis.model,
    voice: synthesis.voice,
    ...typeof provider === 'string' ? { provider } : {},
  }
}

/** The voice of a lecture said with these clips. */
export function clipVoice(clips: Iterable<MadeClip>, fallback: LectureVoice): Voice {
  const first = clips[Symbol.iterator]().next().value as MadeClip | undefined
  return {
    kind: 'synthetic',
    engine: first?.engine ?? fallback.engine ?? '',
    ...first?.model ? { model: first.model } : {},
    voice: first?.voice ?? fallback.voice,
    ...first?.provider ? { provider: first.provider } : {},
  }
}

export interface Unsaid {
  id: string
  section: string
  text: string
  source?: { file: string, line: number }
  reason: string
}

/** Runs `work` over `items`, a few at a time. */
async function each<T>(items: readonly T[], work: (item: T) => Promise<void>, limit = 4): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}

/** The clips of a plan's utterances; the ones that could not be made, with why. */
export async function synthesizePlan(speech: SpeechService, plan: LecturePlan, options: SpeakOptions, signal?: AbortSignal): Promise<{ clips: Map<string, MadeClip>, unsaid: Unsaid[] }> {
  const clips = new Map<string, MadeClip>()
  const unsaid: Unsaid[] = []
  await each(plannedUtterances(plan), async (u) => {
    try {
      clips.set(u.id, await synthesizeClip(speech, u, options, signal))
    } catch (error) {
      unsaid.push({ id: u.id, section: u.section, text: u.text, ...u.source ? { source: { file: u.source.file, line: u.source.line } } : {}, reason: errorMessage(error) })
    }
  })
  unsaid.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return { clips, unsaid }
}

/** The transcripts of a recorded lecture's audio files (`file` gives the local file of a segment, if any). */
export async function transcribeSegments(speech: SpeechService, segments: readonly MediaSegment[], file: (segment: MediaSegment) => string | undefined, options: { engine?: string, lang: string }, signal?: AbortSignal): Promise<SegmentTranscript[]> {
  const transcripts: SegmentTranscript[] = []
  for (const segment of segments) {
    const local = file(segment)
    if (!local || !existsSync(local)) throw new Error(`the audio of section ${segment.section} (${segment.src}) is not on this machine`)
    const transcript = await speech.transcribe({ ...options.engine ? { engine: options.engine } : {}, audio: audioBlob(local), lang: options.lang }, signal)
    transcripts.push({ segment, segments: transcript.segments })
  }
  return transcripts
}
