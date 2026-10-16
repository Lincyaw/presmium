/**
 * The AI-generated label in the audio's metadata (N-08, docs/ir.md 9.1), as
 * the speech service (not the engine) writes it, without re-encoding and
 * without changing what the engine wrote: WAV gets a `LIST`/`INFO` chunk with
 * `AIGC` (the GB 45438 fields as JSON) and `ICMT` (`AIGC={…}`); Ogg/Opus gets
 * the comment `AIGC={…}` in its comment header (docs/design-v0.7.md section 11).
 */
import type { AigcLabel } from '../../domain/index.ts'
import { aigcString } from '../../domain/index.ts'
import { SpeechError } from '../errors.ts'
import { isOgg, oggOpusDuration, withOpusComment } from './ogg.ts'
import { isWav, wavDuration, withInfo } from './riff.ts'

export interface LabeledAudio {
  audio: Uint8Array
  mime: string
  /** The cache file's extension. */
  ext: string
  /** Seconds, from the audio itself. */
  duration: number
}

export function labelAudio(bytes: Uint8Array, label: AigcLabel): LabeledAudio {
  if (isWav(bytes)) {
    return { audio: withInfo(bytes, [['AIGC', JSON.stringify(label)], ['ICMT', aigcString(label)]]), mime: 'audio/wav', ext: 'wav', duration: wavDuration(bytes) }
  }
  if (isOgg(bytes)) {
    try {
      return { audio: withOpusComment(bytes, aigcString(label)), mime: 'audio/ogg', ext: 'ogg', duration: oggOpusDuration(bytes) }
    } catch (error) {
      throw new SpeechError(502, `the engine's Ogg audio cannot carry the AI-generated label: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new SpeechError(502, 'the engine returned audio that is neither WAV nor Ogg/Opus, so the AI-generated label cannot be written into it')
}

/** The MIME type of audio bytes, by their first bytes; else the given type. */
export function audioMime(bytes: Uint8Array, given?: string): string {
  if (isWav(bytes)) return 'audio/wav'
  if (isOgg(bytes)) return 'audio/ogg'
  return given?.split(';')[0]?.trim() || 'application/octet-stream'
}
