import { documentVoice, irBlocks, isRecord, parseDuration, resolvedVoice, speechVoice, voiceOverrides } from '@lincyaw/kernel'
import type { IRDocument, IRSection, SpeechVoice, VoiceTarget } from '@lincyaw/kernel'

export interface LectureVoice {
  engine?: string
  voice: string
  rate?: number
  style?: string
}

export interface NarrationVoice { voice?: SpeechVoice, issue?: string, target?: VoiceTarget }

export function configuredLectureVoice(doc: IRDocument): LectureVoice | undefined {
  const overrides = voiceOverrides(doc)
  return documentVoice(doc) ?? Object.values(overrides.pages)[0] ?? overrides.steps[0]?.voice
}

/** Resolve against the complete IR before renderer filtering compacts its steps. */
export function prepareNarrationVoices(doc: IRDocument): void {
  // JSON lowering resolves each authored narration against its stable step and
  // Production scope. Do not replace those bindings with legacy source hints.
  if (doc.production) return
  const overrides = voiceOverrides(doc)
  for (const section of doc.sections) {
    const bindings = Object.fromEntries([...irBlocks(section.blocks)].filter(block => block.role === 'narration').map(block => {
      const resolved = resolvedVoice(doc, section, block.at)
      const unsafe = resolved.reason && overrides.steps.some(entry => entry.section === section.id)
      return [block.id, { ...resolved.editable ? { target: resolved.target } : {}, ...unsafe ? { issue: resolved.reason } : resolved.voice ? { voice: resolved.voice } : { issue: 'voice-unset' } }]
    }))
    section.config = { ...section.config, 'presmium.lecture': { ...section.config?.['presmium.lecture'], resolvedNarrationVoices: bindings } }
  }
}

export function narrationVoice(doc: IRDocument, section: IRSection, block?: string, step = 0): NarrationVoice {
  const configured = section.config?.['presmium.lecture']?.resolvedNarrationVoices
  const mapped = block && isRecord(configured) ? configured[block] : undefined
  if (isRecord(mapped)) return { ...speechVoice(mapped.voice) ? { voice: speechVoice(mapped.voice) } : {}, ...typeof mapped.issue === 'string' ? { issue: mapped.issue } : {}, ...isRecord(mapped.target) ? { target: mapped.target as unknown as VoiceTarget } : {} }
  const overrides = voiceOverrides(doc)
  if (section.stepMap && overrides.steps.some(entry => entry.section === section.id)) return { issue: 'voice-step-binding-unavailable' }
  const resolved = resolvedVoice(doc, section, step)
  if (resolved.reason && overrides.steps.some(entry => entry.section === section.id)) return { issue: resolved.reason }
  return { ...resolved.editable ? { target: resolved.target } : {}, ...resolved.voice ? { voice: resolved.voice } : { issue: 'voice-unset' } }
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
