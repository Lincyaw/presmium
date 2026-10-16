/**
 * The assistant's routes under `/__presmium/presmium.assistant/` (docs/architecture.md
 * 4.8, design-v0.7 5.3): `info` (what the member may ask, the provider and
 * the runtime), `tasks` (submit), `tasks/<id>/events` (SSE of `AgentEvent`)
 * and `tasks/<id>/cancel`.
 */
import { isRecord } from '@presmium/kernel'
import type { AgentContext, AgentTaskKind, AgentTaskRequest } from '@presmium/kernel'

/** `GET info`. */
export interface AssistantInfo {
  /** The model's provider, known before any request (N-08); absent when the assistant is unavailable. */
  provider?: string
  /** Name and version the agent reported, once one started. */
  runtime?: string
  /** The kinds of task this member may submit here. */
  kinds: AgentTaskKind[]
}

const KINDS: AgentTaskKind[] = ['question', 'annotations', 'chat', 'transcript']

/** Kinds that change the source (P-113, P-114, P-136). */
export const CHANGE_KINDS: AgentTaskKind[] = ['annotations', 'chat', 'transcript']

const str = (value: unknown, max = 20_000) => (typeof value === 'string' && value.length <= max ? value : undefined)

function contextOf(value: unknown): AgentContext | undefined {
  if (!isRecord(value)) return undefined
  const context: AgentContext = { document: str(value.document, 1000) ?? '' }
  for (const key of ['section', 'block', 'view', 'selection'] as const) {
    const found = str(value[key])
    if (found) context[key] = found
  }
  if (typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= 0) context.step = value.step
  if (isRecord(value.source) && typeof value.source.file === 'string' && typeof value.source.startLine === 'number' && typeof value.source.endLine === 'number') {
    context.source = { file: value.source.file, startLine: value.source.startLine, endLine: value.source.endLine }
  }
  return context
}

/** The body of `POST tasks`: a task request, and the id the page drew for it. */
export function taskRequestOf(body: unknown): { id?: string, request: AgentTaskRequest } | undefined {
  if (!isRecord(body) || !KINDS.includes(body.kind as AgentTaskKind)) return undefined
  const prompt = str(body.prompt)
  const context = contextOf(body.context)
  if (!prompt?.trim() || !context) return undefined
  const id = typeof body.id === 'string' && /^[\w-]{8,64}$/.test(body.id) ? body.id : undefined
  return {
    ...id ? { id } : {},
    request: {
      kind: body.kind as AgentTaskKind,
      prompt,
      context,
      ...Array.isArray(body.annotations) ? { annotations: body.annotations as AgentTaskRequest['annotations'] } : {},
      ...typeof body.track === 'string' ? { track: body.track } : {},
    },
  }
}
