import { irBlocks } from './blocks.ts'
import { isRecord } from './errors.ts'
import { fnv1a64 } from './fingerprint.ts'
import type { IRDocument, IRSection, MdastNode } from './ir.ts'
import { stepKeys } from './step-keys.ts'
import type { SpeechVoice } from './contracts/speech.ts'
import type { ResolvedVoice, VoiceOverrides, VoiceTarget } from './contracts/voice.ts'

export function speechVoice(value: unknown): SpeechVoice | undefined {
  if (!isRecord(value) || typeof value.voice !== 'string' || !value.voice.trim()) return undefined
  if (value.engine !== undefined && (typeof value.engine !== 'string' || !value.engine.trim())) return undefined
  if (value.rate !== undefined && (typeof value.rate !== 'number' || !Number.isFinite(value.rate) || value.rate <= 0)) return undefined
  if (value.style !== undefined && typeof value.style !== 'string') return undefined
  return { voice: value.voice, ...typeof value.engine === 'string' ? { engine: value.engine } : {}, ...typeof value.rate === 'number' ? { rate: value.rate } : {}, ...typeof value.style === 'string' ? { style: value.style } : {} }
}

export function voiceTarget(section: IRSection, step: number): VoiceTarget {
  if (!Number.isSafeInteger(step) || step < 0 || step > section.steps) throw new Error('voice-target')
  return { section: section.id, step, binding: fnv1a64(JSON.stringify([section.id, stepKeys(section)])) }
}

export function documentVoice(doc: IRDocument): SpeechVoice | undefined { return speechVoice(doc.config.renderers.lecture?.voice) }

export function voiceOverrides(doc: IRDocument): VoiceOverrides {
  const raw = doc.config.renderers.lecture?.voiceOverrides
  if (raw === undefined) return { pages: {}, steps: [] }
  if (!isRecord(raw) || raw.pages !== undefined && !isRecord(raw.pages) || raw.steps !== undefined && !Array.isArray(raw.steps)) throw new Error('voice-settings-invalid')
  const pages: Record<string, SpeechVoice> = Object.create(null)
  for (const [section, value] of Object.entries(raw.pages ?? {})) {
    const voice = speechVoice(value)
    if (!voice) throw new Error('voice-settings-invalid')
    pages[section] = voice
  }
  const steps: VoiceOverrides['steps'] = []
  const used = new Set<string>()
  for (const value of raw.steps ?? []) {
    if (!isRecord(value) || typeof value.section !== 'string' || typeof value.step !== 'number' || !Number.isSafeInteger(value.step) || value.step < 0 || typeof value.binding !== 'string') throw new Error('voice-settings-invalid')
    const voice = speechVoice(value.voice), key = JSON.stringify([value.section, value.step])
    if (!voice || used.has(key)) throw new Error('voice-settings-invalid')
    used.add(key)
    steps.push({ section: value.section, step: value.step, binding: value.binding, voice })
  }
  return { pages, steps }
}

function advances(node: MdastNode): boolean {
  if (node.type === 'presmiumRole' && node.plugin === 'presmium.lecture' && node.name === 'cue' && isRecord(node.options) && typeof node.options.value === 'string' && /^next(?:\s|$)/.test(node.options.value.trim())) return true
  return node.children?.some(advances) ?? false
}

/** A cue can change the visual step inside one audio clip. That clip cannot yet take independent step voices. */
export function stepVoiceReason(doc: IRDocument, section: IRSection): ResolvedVoice['reason'] | undefined {
  if (typeof doc.config.renderers.lecture?.script === 'string' && doc.config.renderers.lecture.script) return 'script-file'
  if ([...irBlocks(section.blocks)].some(block => block.role === 'narration' && block.node.type === 'markdown' && advances(block.node.mdast))) return 'cue-step'
  const expected = voiceTarget(section, 0).binding
  if (voiceOverrides(doc).steps.some(entry => entry.section === section.id && (entry.binding !== expected || entry.step > section.steps))) return 'step-binding-stale'
  return undefined
}

export function resolvedVoice(doc: IRDocument, section: IRSection, step: number): ResolvedVoice {
  const target = voiceTarget(section, step), overrides = voiceOverrides(doc)
  const reason = stepVoiceReason(doc, section)
  const own = !reason && overrides.steps.find(entry => entry.section === section.id && entry.step === step && entry.binding === target.binding)?.voice
  const page = overrides.pages[section.id], fallback = documentVoice(doc)
  return { target, ...own || page || fallback ? { voice: own || page || fallback } : {}, inheritedFrom: own ? 'step' : page ? 'page' : fallback ? 'document' : 'unset', ...own ? { override: own } : {}, editable: !reason, ...reason ? { reason } : {} }
}
