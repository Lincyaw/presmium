import type { IRDocument, SpeechService } from '@lincyaw/kernel'
import { transcribedTrack } from '../domain/index.ts'
import type { LectureTrack, MediaSegment, SegmentTranscript } from '../domain/index.ts'
import { transcriptionEngine } from './engines.ts'
import { mediaFile, readInDeck, readTrack, trackDir, writeTrack } from './store.ts'
import type { DeckFiles } from './store.ts'

const MIME: Record<string, string> = { wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', mp4: 'audio/mp4', m4a: 'audio/mp4' }

function audioBlob(file: string, bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes)], { type: MIME[file.split('.').at(-1) ?? ''] ?? 'application/octet-stream' })
}

async function transcribeSegments(speech: SpeechService, segments: readonly MediaSegment[], audio: (segment: MediaSegment) => Blob | undefined, options: { engine?: string, lang: string }, signal?: AbortSignal): Promise<SegmentTranscript[]> {
  const transcripts: SegmentTranscript[] = []
  for (const segment of segments) {
    const local = audio(segment)
    if (!local) throw new Error(`the audio of section ${segment.section} (${segment.src}) is not on this machine`)
    const transcript = await speech.transcribe({ ...options.engine ? { engine: options.engine } : {}, audio: local, lang: options.lang }, signal)
    transcripts.push({ segment, segments: transcript.segments })
  }
  return transcripts
}

export async function transcribeLecture(files: DeckFiles, deckDir: string, id: string, speech: SpeechService, doc: IRDocument | undefined, signal?: AbortSignal): Promise<{ track: LectureTrack, bound: number, provider: string }> {
  const stored = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
  if (!stored) throw new Error(`no lecture ${id}`)
  const engine = await transcriptionEngine(speech, doc)
  if (!engine) throw new Error('no speech engine transcribes: the operator defines one (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER)')
  const audio = (segment: { src: string }) => {
    const file = mediaFile(deckDir, id, segment.src)
    const bytes = file && readInDeck(deckDir, file)
    return file && bytes ? audioBlob(file, bytes) : undefined
  }
  const transcripts = await transcribeSegments(speech, stored.track.audio ?? [], audio, { engine: engine.id, lang: stored.track.lang }, signal)
  const { track, bound } = transcribedTrack(stored.track, transcripts)
  await writeTrack(files, deckDir, track)
  return { track, bound, provider: engine.provider }
}
