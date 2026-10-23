import { isRecord, parseDuration } from '@lincyaw/kernel'

export interface LectureVoice {
  engine?: string
  voice: string
  rate?: number
  style?: string
}

export function lectureVoice(config: Record<string, unknown> | undefined): LectureVoice | undefined {
  const voice = isRecord(config?.voice) ? config.voice : undefined
  if (typeof voice?.voice !== 'string' || !voice.voice) return undefined
  return {
    voice: voice.voice,
    ...typeof voice.engine === 'string' && voice.engine ? { engine: voice.engine } : {},
    ...typeof voice.rate === 'number' ? { rate: voice.rate } : {},
    ...typeof voice.style === 'string' && voice.style ? { style: voice.style } : {},
  }
}

export function lectureGap(config: Record<string, unknown> | undefined): number {
  const gap = config?.gap
  if (typeof gap === 'number' && gap >= 0) return gap
  return (typeof gap === 'string' ? parseDuration(gap) : undefined) ?? 500
}

export function lexiconOf(config: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const lexicon = isRecord(config?.lexicon) ? config.lexicon : undefined
  if (!lexicon) return undefined
  const entries = Object.entries(lexicon).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return entries.length ? Object.fromEntries(entries) : undefined
}
