import { aigcString } from '@lincyaw/kernel'
import type { AigcLabel } from '@lincyaw/kernel'
import { SpeechError } from '../errors.ts'
import { isOgg, oggOpusDuration, withOpusComment } from './ogg.ts'
import { isWav, wavDuration, withInfo } from './riff.ts'

export interface LabeledAudio {
  audio: Uint8Array
  mime: string
  ext: string
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

export function audioMime(bytes: Uint8Array, given?: string): string {
  if (isWav(bytes)) return 'audio/wav'
  if (isOgg(bytes)) return 'audio/ogg'
  return given?.split(';')[0]?.trim() || 'application/octet-stream'
}
