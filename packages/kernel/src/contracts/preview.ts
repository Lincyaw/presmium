import { isRecord } from '../errors.ts'

export const PREVIEW_PROTOCOL = 1

export const PREVIEW_NAME = 'presmium-preview'

export const PREVIEW_PARAM = 'presmium-preview'

export const PREVIEW_REVISION = 'presmiumRevision'

export const AUTHOR_MARKS_CLASS = 'pm-author-marks'

export interface PreviewAnchor {
  section: string
  block?: string
}

export interface PreviewPin {
  id: string
  section: string
  block: string
  label: string
}

export interface PreviewPosition {
  section: string
  step: number
  trail: string[]
  view?: string
}

export type PreviewCommand =
  | { type: 'go', section: string, step?: number, trail?: string[], view?: string }
  | { type: 'highlight', target: PreviewAnchor | null }
  | { type: 'pick', on: boolean }
  | { type: 'pins', targets: PreviewPin[] }
  | { type: 'marks', on: boolean }
  | { type: 'appearance', dark: boolean }
  | { type: 'activity', active: boolean, request: number }

export type PreviewCommandType = PreviewCommand['type']

export type PreviewShortcut = 'open-files' | 'open-commands'

export type PreviewReport =
  | { type: 'ready', renderer: 'web' | 'slides', document: string, revision?: string, capabilities: PreviewCommandType[] }
  | ({ type: 'position' } & PreviewPosition)
  | { type: 'picked', section: string, block?: string, step?: number, trail?: string[] }
  | { type: 'selection', selection: (PreviewAnchor & { text: string }) | null }
  | { type: 'updated', revision?: string }
  | { type: 'activity', active: boolean, request: number, revision?: string, error?: string }
  | { type: 'report', level: 'error' | 'warning', plugin?: string, message: string, resolved?: boolean }
  | { type: 'shortcut', command: PreviewShortcut }

export type PreviewEnvelope<M> = M & { protocol: typeof PREVIEW_NAME, version: number, nonce: string }

export function previewEnvelope<M extends PreviewCommand | PreviewReport>(nonce: string, message: M): PreviewEnvelope<M> {
  return { protocol: PREVIEW_NAME, version: PREVIEW_PROTOCOL, nonce, ...message }
}

const text = (value: unknown): value is string => typeof value === 'string'
const optional = <T>(value: unknown, is: (v: unknown) => v is T) => value === undefined || is(value)
const step = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const request = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 10_000 && value.every(text)
const anchor = (value: unknown): value is PreviewAnchor => isRecord(value) && text(value.section) && optional(value.block, text)

export function isPreviewEnvelope(data: unknown, nonce: string): data is PreviewEnvelope<{ type: string }> {
  return isRecord(data) && data.protocol === PREVIEW_NAME && data.nonce === nonce && typeof data.version === 'number' && text(data.type)
}

export function toPreviewCommand(data: unknown, nonce: string): PreviewCommand | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'go': return text(m.section) && optional(m.step, step) && optional(m.trail, strings) && optional(m.view, text) ? { type: 'go', section: m.section, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {}, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'highlight': return m.target === null || anchor(m.target) ? { type: 'highlight', target: m.target === null ? null : { section: m.target.section, ...m.target.block ? { block: m.target.block } : {} } } : undefined
    case 'pick':
    case 'marks': return typeof m.on === 'boolean' ? { type: m.type, on: m.on } : undefined
    case 'appearance': return typeof m.dark === 'boolean' ? { type: 'appearance', dark: m.dark } : undefined
    case 'activity': return typeof m.active === 'boolean' && request(m.request) ? { type: 'activity', active: m.active, request: m.request } : undefined
    case 'pins': return Array.isArray(m.targets) && m.targets.length <= 1000 && m.targets.every(t => isRecord(t) && text(t.id) && text(t.section) && text(t.block) && text(t.label))
      ? { type: 'pins', targets: (m.targets as PreviewPin[]).map(({ id, section, block, label }) => ({ id, section, block, label })) }
      : undefined
    default: return undefined
  }
}

export function toPreviewReport(data: unknown, nonce: string): PreviewReport | undefined {
  if (!isPreviewEnvelope(data, nonce) || data.version !== PREVIEW_PROTOCOL) return undefined
  const m = data as Record<string, unknown>
  switch (m.type) {
    case 'ready': return (m.renderer === 'web' || m.renderer === 'slides') && text(m.document) && optional(m.revision, text) && strings(m.capabilities) ? { type: 'ready', renderer: m.renderer, document: m.document, ...m.revision ? { revision: m.revision as string } : {}, capabilities: m.capabilities as PreviewCommandType[] } : undefined
    case 'position': return text(m.section) && step(m.step) && strings(m.trail) && optional(m.view, text) ? { type: 'position', section: m.section, step: m.step, trail: m.trail, ...m.view ? { view: m.view as string } : {} } : undefined
    case 'picked': return text(m.section) && optional(m.block, text) && optional(m.step, step) && optional(m.trail, strings) ? { type: 'picked', section: m.section, ...m.block ? { block: m.block as string } : {}, ...m.step === undefined ? {} : { step: m.step as number }, ...m.trail ? { trail: m.trail as string[] } : {} } : undefined
    case 'selection': return m.selection === null || (isRecord(m.selection) && text(m.selection.text) && anchor(m.selection)) ? { type: 'selection', selection: m.selection as (PreviewAnchor & { text: string }) | null } : undefined
    case 'updated': return optional(m.revision, text) ? { type: 'updated', ...m.revision ? { revision: m.revision as string } : {} } : undefined
    case 'activity': return typeof m.active === 'boolean' && request(m.request) && optional(m.revision, text) && optional(m.error, text)
      ? { type: 'activity', active: m.active, request: m.request, ...m.revision === undefined ? {} : { revision: m.revision as string }, ...m.error === undefined ? {} : { error: m.error as string } }
      : undefined
    case 'report': return (m.level === 'error' || m.level === 'warning') && text(m.message) && optional(m.plugin, text) && (m.resolved === undefined || typeof m.resolved === 'boolean') ? { type: 'report', level: m.level, message: m.message, ...m.plugin ? { plugin: m.plugin as string } : {}, ...m.resolved === undefined ? {} : { resolved: m.resolved as boolean } } : undefined
    case 'shortcut': return m.command === 'open-files' || m.command === 'open-commands' ? { type: 'shortcut', command: m.command } : undefined
    default: return undefined
  }
}
