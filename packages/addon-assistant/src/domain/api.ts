/**
 * The assistant's routes under `/__presmium/presmium.assistant/` (docs/architecture.md
 * 4.8, design-v0.7 5.3): `info` (what the member may ask, the provider and
 * the runtime), `tasks` (submit; `GET`: the document's change task under
 * way), `tasks/<id>/events` (SSE of `AgentEvent`), `tasks/<id>/cancel`,
 * `tasks/<id>/review` (the decision on a change task's review),
 * `tasks/<id>/restore` (back to before a step of it), `revert` (undo a
 * task's commit) and `excerpt` (lines of a source file of the document, for
 * an annotation).
 */
import { isRecord } from '@presmium/kernel'
import type { AgentContext, AgentTaskKind, AgentTaskRequest, Annotation, ReviewDecision, SourceRange } from '@presmium/kernel'

/** `GET info`. */
export interface AssistantInfo {
  /** The model's provider, known before any request (N-08); absent when the assistant is unavailable. */
  provider?: string
  /** Name and version the agent reported, once one started. */
  runtime?: string
  /** The kinds of task this member may submit here. */
  kinds: AgentTaskKind[]
}

/** `GET tasks`: the document's change task under way or waiting for its review, to the member who sent it and to owners. */
export interface PendingChange {
  id: string
  kind: AgentTaskKind
  prompt: string
  annotations?: Annotation[]
  track?: string
  /** Who sent it. */
  member: { id: string, name: string }
}

/** `POST tasks/<id>/restore`. */
export function restoreStepOf(body: unknown): string | undefined {
  return isRecord(body) && typeof body.step === 'string' && body.step.length > 0 && body.step.length <= 200 ? body.step : undefined
}

/** `POST revert`: the commit of a task undone, or the files that conflict with later commits. */
export type RevertAnswer = { ok: true, revision: string } | { ok: false, conflicts: string[] }

const KINDS: AgentTaskKind[] = ['question', 'annotations', 'chat', 'transcript']

/** Kinds that change the source (P-113, P-114, P-136; drafting a new document is a `chat`). */
export const CHANGE_KINDS: AgentTaskKind[] = ['annotations', 'chat', 'transcript']

/** At most this many annotations go in one task. */
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

/** An annotation as the page sends it; its status becomes `sent`. */
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

/** The body of `POST tasks`: a task request, and the id the page drew for it. */
export function taskRequestOf(body: unknown): { id?: string, request: AgentTaskRequest } | undefined {
  if (!isRecord(body) || !KINDS.includes(body.kind as AgentTaskKind)) return undefined
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

/** The body of `POST tasks/<id>/review`. */
export function reviewDecisionOf(body: unknown): ReviewDecision | undefined {
  if (!isRecord(body) || typeof body.accept !== 'boolean') return undefined
  if (!body.accept) return { accept: false }
  if (body.reject === undefined) return { accept: true }
  if (!Array.isArray(body.reject) || body.reject.length > 10_000 || body.reject.some(path => typeof path !== 'string')) return undefined
  return { accept: true, reject: body.reject as string[] }
}

/** How a change task ends (`settings.presmium.assistant.review`): reviewed by its sender (default), or accepted at once. */
export type ReviewMode = 'required' | 'auto'

export function reviewMode(settings: Record<string, unknown>): ReviewMode {
  return settings.review === 'auto' ? 'auto' : 'required'
}

/** How long a review waits while no page follows it before it is rolled back (`settings.presmium.assistant.reviewTimeoutMs`; 30 minutes). */
export function reviewTimeoutMs(settings: Record<string, unknown>): number {
  const value = settings.reviewTimeoutMs
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 30 * 60_000
}

const count = (value: unknown, otherwise: number) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : otherwise)

/**
 * How many learners' questions run at a time (`settings.presmium.assistant.maxQuestions`, D-13, F-08):
 * `{ member, total }`, each member's and the service's, 2 and 16 by default; a number is each member's.
 */
export function questionLimits(settings: Record<string, unknown>): { member: number, total: number } {
  const value = settings.maxQuestions
  if (typeof value === 'number') return { member: count(value, 2), total: 16 }
  const given = isRecord(value) ? value : {}
  return { member: count(given.member, 2), total: count(given.total, 16) }
}

/** How long a question no page follows runs before it is cancelled (`settings.presmium.assistant.questionTimeoutMs`; 2 minutes, D-13). */
export function questionTimeoutMs(settings: Record<string, unknown>): number {
  const value = settings.questionTimeoutMs
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 2 * 60_000
}
