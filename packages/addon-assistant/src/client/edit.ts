import { trackAgentTask } from '@presmium/host'
import type { AgentTaskState } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import type { AgentClient, AgentContext, AgentTask, Annotation, SourceRange } from '@presmium/kernel'
import { computed, ref, shallowRef, watch } from 'vue'
import type { PendingChange } from '../domain/index.ts'
import type { AssistantClient } from './agent.ts'

export interface Picked {
  section: string
  block: string
  source: SourceRange
  label: string
  excerpt: string
}

export const picked = shallowRef<Picked>()
export const annotations = ref<Annotation[]>([])

export interface ChangeState {
  id: string
  kind: 'annotations' | 'chat' | 'transcript'
  label: string
  task: AgentTask
  progress: AgentTaskState
  rejected: string[]
  note?: string
  reverted?: string
  conflicts?: string[]
}

export const changes = ref<ChangeState[]>([])

const UNDER_WAY = ['running', 'review', 'deciding']

export const busy = computed(() => UNDER_WAY.includes(changes.value[0]?.progress.state ?? ''))

export async function excerptOf(fetchRoute: (path: string) => Promise<Response>, source: SourceRange): Promise<string> {
  try {
    const response = await fetchRoute(`excerpt?file=${encodeURIComponent(source.file)}&start=${source.startLine}&end=${source.endLine}`)
    const body = await response.json() as { text?: string }
    return response.ok ? body.text ?? '' : ''
  } catch {
    return ''
  }
}

let drawn = 0
const annotationId = () => `a${Date.now().toString(36)}${(++drawn).toString(36)}`

export function addAnnotation(request: string): void {
  const target = picked.value
  if (!target || !request.trim()) return
  annotations.value.push({ id: annotationId(), section: target.section, block: target.block, source: target.source, excerpt: target.excerpt, request: request.trim(), status: 'draft' })
  picked.value = undefined
}

export function removeAnnotation(id: string): void {
  annotations.value = annotations.value.filter(a => a.id !== id || a.status !== 'draft')
}

const find = (id: string) => changes.value.find(change => change.id === id)

function start(kind: ChangeState['kind'], label: string, task: AgentTask): void {
  changes.value.unshift({ id: task.id, kind, label, task, progress: trackAgentTask(task).value, rejected: [] })
  const now = find(task.id)!
  const stop = watch(() => [now.progress.state, now.progress.changes, now.progress.annotations] as const, ([state, _changes, reported], [, before]) => {
    for (const [id, { status, note }] of Object.entries(reported)) {
      const annotation = annotations.value.find(a => a.id === id)
      if (!annotation) continue
      annotation.status = status
      if (note !== undefined) annotation.note = note
    }
    if (_changes !== before) Object.assign(now, { rejected: [], note: undefined })
    if (state === 'done' || state === 'failed') stop()
  }, { deep: true })
}

export function sendAnnotations(client: AgentClient, label: string): void {
  const drafts = annotations.value.filter(a => a.status === 'draft')
  if (drafts.length === 0 || busy.value) return
  for (const draft of drafts) draft.status = 'sent'
  start('annotations', label, client.submit({ kind: 'annotations', prompt: '', context: { document: '' }, annotations: drafts.map(a => ({ ...a })) }))
}

export function sendChat(client: AgentClient, message: string, context: AgentContext): void {
  if (!message.trim() || busy.value) return
  start('chat', message.trim(), client.submit({ kind: 'chat', prompt: message.trim(), context }))
}

let resumed = false

export async function resume(client: AssistantClient, labelOf: (change: PendingChange) => string): Promise<void> {
  if (resumed) return
  resumed = true
  const change = await client.pending()
  if (!change || find(change.id)) return
  for (const annotation of change.annotations ?? []) {
    if (!annotations.value.some(a => a.id === annotation.id)) annotations.value.push({ ...annotation, status: 'sent' })
  }
  start(change.kind, labelOf(change), client.attach(change.id))
}

export async function restoreTo(id: string, step: string, fetchRoute: (path: string, init?: RequestInit) => Promise<Response>): Promise<void> {
  const now = find(id)
  if (!now || now.progress.state !== 'review') return
  now.progress.state = 'deciding'
  now.note = undefined
  try {
    const response = await fetchRoute(`tasks/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step }) })
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `${response.status}`)
    await response.text()
  } catch (error) {
    if (now.progress.state === 'deciding') {
      now.progress.state = 'review'
      now.note = errorMessage(error)
    }
  }
}

export function keep(id: string, path: string, kept: boolean): void {
  const now = find(id)
  if (now) now.rejected = kept ? now.rejected.filter(p => p !== path) : [...new Set([...now.rejected, path])]
}

export async function decide(id: string, accept: boolean): Promise<void> {
  const now = find(id)
  if (!now || now.progress.state !== 'review') return
  const reject = [...now.rejected]
  now.progress.state = 'deciding'
  try {
    await now.task.review(accept ? { accept: true, ...reject.length ? { reject } : {} } : { accept: false })
  } catch (error) {
    Object.assign(now.progress, { state: 'failed', message: errorMessage(error) })
  }
}

export async function revert(id: string): Promise<void> {
  const now = find(id)
  if (!now?.progress.revision) return
  now.note = undefined
  try {
    const result = await now.task.revert()
    if (result.ok) now.reverted = result.revision
    else now.conflicts = result.conflicts
  } catch (error) {
    now.note = errorMessage(error)
  }
}
