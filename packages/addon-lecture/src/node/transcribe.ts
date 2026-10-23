import type { IRDocument, SpeechService } from '@lincyaw/kernel'
import { sectionHints, transcribedTrack } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, SegmentTranscript } from '../domain/index.ts'
import { whyNoTranscriptionEngine, transcriptionEngine } from './engines.ts'
import { deckPlan } from './plan.ts'
import { mediaFile, readInDeck, readTrack, trackDir, writeTrack } from './store.ts'
import type { DeckFiles } from './store.ts'

const MIME: Record<string, string> = { wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4' }

function audioBlob(file: string, bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes)], { type: MIME[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream' })
}

interface TranscriptionOptions {
  engine?: string
  lang: string
  /** The words likely said in a section (its narration's), which the engine takes as hints. */
  hints: (section: string) => string[]
}

async function transcribeSegments(speech: SpeechService, segments: readonly MediaSegment[], audio: (segment: MediaSegment) => Blob | undefined, options: TranscriptionOptions, signal?: AbortSignal): Promise<SegmentTranscript[]> {
  const transcripts: SegmentTranscript[] = []
  for (const segment of segments) {
    const local = audio(segment)
    if (!local) throw new Error(`the audio of section ${segment.section} (${segment.src}) is not on this machine`)
    const hints = options.hints(segment.section)
    const transcript = await speech.transcribe({ ...options.engine ? { engine: options.engine } : {}, audio: local, lang: options.lang, ...hints.length ? { hints } : {} }, signal)
    transcripts.push({ segment, segments: transcript.segments })
  }
  return transcripts
}

export async function transcribeLecture(files: DeckFiles, deckDir: string, id: string, speech: SpeechService, doc: IRDocument | undefined, signal?: AbortSignal): Promise<{ track: LectureTrack, bound: number, provider: string }> {
  const stored = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
  if (!stored) throw new Error(`no lecture ${id}`)
  const engine = await transcriptionEngine(speech, doc)
  if (!engine) throw new Error(whyNoTranscriptionEngine(doc))
  const audio = (segment: { src: string }) => {
    const file = mediaFile(deckDir, id, segment.src)
    const bytes = file && readInDeck(deckDir, file)
    return file && bytes ? audioBlob(file, bytes) : undefined
  }
  const plan = doc && deckPlan(doc, deckDir).plan
  const hints = (section: string) => {
    const planned = plan?.sections.find(s => s.id === section)
    return planned ? sectionHints(planned, stored.track.lang) : []
  }
  const transcripts = await transcribeSegments(speech, stored.track.audio ?? [], audio, { engine: engine.id, lang: stored.track.lang, hints }, signal)
  const { track, bound } = transcribedTrack(stored.track, transcripts)
  await writeTrack(files, deckDir, track)
  return { track, bound, provider: engine.provider }
}
