import { renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { errorMessage, isRecord, remapWords } from '@lincyaw/kernel'
import type { SpeechService, SpeechWord, SynthesisRequest, WordSpan, WrittenWord } from '@lincyaw/kernel'
import { plannedUtterances } from '../domain/index.ts'
import type { Clip, LecturePlan, LectureVoice, MediaSegment, SegmentTranscript, Voice } from '../domain/index.ts'
import type { DeckFiles } from './store.ts'
import { readRegular } from './store.ts'

export function sameEngine(a: string, b: string): boolean {
  const id = (s: string) => s.trim().toLowerCase().replace(/-/g, '_')
  return id(a) === id(b)
}

export interface SpeakOptions {
  voice: LectureVoice
  lang: string
  lexicon?: Record<string, string>
  lookup?: boolean
  files?: DeckFiles
}

export interface MadeClip extends Clip {
  key: string
  engine: string
  model: string
  voice: string
  provider?: string
}

function cacheJson(file: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readRegular(file)?.toString('utf8') ?? '')
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function record(file: string): Record<string, unknown> | undefined {
  return cacheJson(join(dirname(file), `${basename(file).replace(/\.\w+$/, '')}.json`))
}

const MIME: Record<string, string> = { wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4' }

export function audioBlob(file: string, bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes)], { type: MIME[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream' })
}

async function alignedWords(speech: SpeechService, file: string, key: string, lang: string, lookup: boolean, files: DeckFiles | undefined, signal?: AbortSignal): Promise<SpeechWord[] | undefined> {
  const kept = join(dirname(file), `${key}.align.json`)
  const value = /^[0-9a-f]{32}$/.test(key) ? cacheJson(kept) : undefined
  if (Array.isArray(value?.words)) return value.words as SpeechWord[]
  const bytes = lookup ? undefined : readRegular(file)
  if (!bytes) return undefined
  try {
    const transcript = await speech.transcribe({ audio: audioBlob(file, bytes), lang }, signal)
    const words = transcript.segments.flatMap(s => s.words)
    if (words.length === 0) return undefined
    const text = `${JSON.stringify({ key, words }, null, 2)}\n`
    if (files) {
      await files.write(kept, text)
    } else {
      const temporary = `${kept}.${process.pid}.tmp`
      writeFileSync(temporary, text)
      renameSync(temporary, kept)
    }
    return words
  } catch {
    return undefined
  }
}

export async function synthesizeClip(speech: SpeechService, said: { text: string, spoken: string, spans: WordSpan[] }, options: SpeakOptions, signal?: AbortSignal): Promise<MadeClip> {
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
  const engineWords = synthesis.words?.length ? synthesis.words : await alignedWords(speech, synthesis.audio, synthesis.key, options.lang, Boolean(options.lookup), options.files, signal)
  const words: WrittenWord[] | undefined = engineWords && remapWords(engineWords, said.text, said.spoken, said.spans)
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

async function each<T>(items: readonly T[], work: (item: T) => Promise<void>, limit = 4): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}

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

export async function transcribeSegments(speech: SpeechService, segments: readonly MediaSegment[], audio: (segment: MediaSegment) => Blob | undefined, options: { engine?: string, lang: string }, signal?: AbortSignal): Promise<SegmentTranscript[]> {
  const transcripts: SegmentTranscript[] = []
  for (const segment of segments) {
    const local = audio(segment)
    if (!local) throw new Error(`the audio of section ${segment.section} (${segment.src}) is not on this machine`)
    const transcript = await speech.transcribe({ ...options.engine ? { engine: options.engine } : {}, audio: local, lang: options.lang }, signal)
    transcripts.push({ segment, segments: transcript.segments })
  }
  return transcripts
}
