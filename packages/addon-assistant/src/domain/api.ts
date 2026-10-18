import { isRecord } from '@presmium/kernel'
import type { AgentContext, AgentTaskKind, AgentTaskRequest, Annotation, ReviewDecision, SourceRange } from '@presmium/kernel'
import type { MissingItem, RuntimeSource } from './config.ts'

export interface AssistantInfo {
  provider?: string
  runtime?: string
  source?: RuntimeSource
  missing?: MissingItem
  kinds: AgentTaskKind[]
  home?: boolean
  changes: boolean
}

export interface PendingChange {
  id: string
  kind: AgentTaskKind
  prompt: string
  annotations?: Annotation[]
  track?: string
  member: { id: string, name: string }
}

export function restoreStepOf(body: unknown): string | undefined {
  return isRecord(body) && typeof body.step === 'string' && body.step.length > 0 && body.step.length <= 200 ? body.step : undefined
}

export type RevertAnswer = { ok: true, revision: string } | { ok: false, conflicts: string[] }

export const CHANGE_KINDS: AgentTaskKind[] = ['annotations', 'chat', 'transcript']

export const MAX_ANNOTATIONS = 50

const TASK_ID = /^[\w-]{8,64}$/
const TRACK_ID = /^[\w.-]{1,100}$/

const str = (value: unknown, max = 20_000) => (typeof value === 'string' && value.length <= max ? value : undefined)

function sourceOf(value: unknown): SourceRange | undefined {
  if (!isRecord(value) || typeof value.file !== 'string' || !value.file || value.file.length > 1000) return undefined
  const { startLine, endLine } = value
  if (typeof startLine !== 'number' || typeof endLine !== 'number' || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) return undefined
  return { file: value.file, startLine, endLine }
}

function contextOf(value: unknown): AgentContext | undefined {
  if (!isRecord(value)) return undefined
  const context: AgentContext = { document: str(value.document, 1000) ?? '' }
  for (const key of ['section', 'block', 'view', 'selection'] as const) {
    const found = str(value[key])
    if (found) context[key] = found
  }
  if (typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= 0) context.step = value.step
  const source = sourceOf(value.source)
  if (source) context.source = source
  return context
}

function annotationOf(value: unknown): Annotation | undefined {
  if (!isRecord(value)) return undefined
  const id = str(value.id, 64)
  const section = str(value.section, 1000)
  const block = str(value.block, 1000)
  const request = str(value.request, 4000)
  const source = sourceOf(value.source)
  if (!id || !/^[\w-]+$/.test(id) || !section || !block || !request?.trim() || !source) return undefined
  return { id, section, block, source, excerpt: (str(value.excerpt) ?? '').slice(0, 4000), request, status: 'sent' }
}

export function taskRequestOf(body: unknown): { id?: string, request: AgentTaskRequest } | undefined {
  if (!isRecord(body) || !CHANGE_KINDS.includes(body.kind as AgentTaskKind)) return undefined
  const kind = body.kind as AgentTaskKind
  const prompt = str(body.prompt) ?? ''
  const context = contextOf(body.context)
  if (!context) return undefined
  const annotations = Array.isArray(body.annotations) ? body.annotations.map(annotationOf) : []
  if (kind === 'annotations') {
    if (annotations.length === 0 || annotations.length > MAX_ANNOTATIONS || annotations.some(a => !a)) return undefined
  } else if (!prompt.trim()) {
    return undefined
  }
  const track = typeof body.track === 'string' && TRACK_ID.test(body.track) ? body.track : undefined
  if (kind === 'transcript' && !track) return undefined
  const id = typeof body.id === 'string' && TASK_ID.test(body.id) ? body.id : undefined
  return {
    ...id ? { id } : {},
    request: {
      kind,
      prompt,
      context,
      ...kind === 'annotations' ? { annotations: annotations as Annotation[] } : {},
      ...kind === 'transcript' ? { track } : {},
    },
  }
}

export function reviewDecisionOf(body: unknown): ReviewDecision | undefined {
  if (!isRecord(body) || typeof body.accept !== 'boolean') return undefined
  if (!body.accept) return { accept: false }
  if (body.reject === undefined) return { accept: true }
  if (!Array.isArray(body.reject) || body.reject.length > 10_000 || body.reject.some(path => typeof path !== 'string')) return undefined
  return { accept: true, reject: body.reject as string[] }
}

export type ReviewMode = 'required' | 'auto'

export function reviewMode(settings: Record<string, unknown>): ReviewMode {
  return settings.review === 'auto' ? 'auto' : 'required'
}

export function reviewTimeoutMs(settings: Record<string, unknown>): number {
  const value = settings.reviewTimeoutMs
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 30 * 60_000
}
