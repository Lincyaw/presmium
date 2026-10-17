/**
 * Writing a recorded lecture back (P-136, P-137): the lecture side only
 * builds the requests (design-v0.7 item 23); the assistant runs each as a
 * change task, reviews it with its sender, commits it and undoes the commit
 * (docs/architecture.md 4.8). "Narration from the transcript" is a
 * `transcript` task of the lecture; "translate" a `chat` task whose context
 * is the lecture's track file. The tasks this window sent, newest first,
 * follow their events: progress, the review (accept or reject all), the
 * commit and its undo through the assistant's `revert` route.
 */
import type { ServerClient } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import type { AgentClient, AgentTask, AgentTaskRequest, ReviewChange } from '@presmium/kernel'
import { ref } from 'vue'
import { LECTURES_DIR } from '../domain/index.ts'

/** The assistant's plugin id, whose `revert` route undoes a task's commit (docs/architecture.md 4.8). */
const ASSISTANT = 'presmium.assistant'

export interface WritebackTask {
  id: string
  kind: 'narration' | 'translation'
  track: string
  /** What the panel names it by. */
  label: string
  task: AgentTask
  state: 'running' | 'review' | 'deciding' | 'done' | 'failed'
  tool?: string
  steps: number
  engine?: string
  changes: ReviewChange[]
  revision?: string
  message?: string
  reverted?: string
  conflicts?: string[]
}

/** The tasks sent from this window's lecture panel, newest first. */
export const writebacks = ref<WritebackTask[]>([])

const find = (id: string) => writebacks.value.find(w => w.id === id)

/** A task of this window is under way or waits for its review: the assistant takes one change task per document. */
export const writing = () => ['running', 'review', 'deciding'].includes(writebacks.value[0]?.state ?? '')

async function follow(id: string, task: AgentTask): Promise<void> {
  try {
    for await (const event of task.events) {
      const now = find(id)
      if (!now) return
      if (event.type === 'progress') now.tool = event.status === 'running' ? event.tool ?? event.text : undefined
      else if (event.type === 'step') now.steps++
      else if (event.type === 'review') Object.assign(now, { state: 'review', engine: event.engine, changes: event.changes, tool: undefined })
      else if (event.type === 'done') Object.assign(now, { state: 'done', tool: undefined, ...event.revision ? { revision: event.revision } : {} })
      else if (event.type === 'error') Object.assign(now, { state: 'failed', tool: undefined, message: event.message })
    }
  } catch (error) {
    const now = find(id)
    if (now) Object.assign(now, { state: 'failed', message: errorMessage(error) })
  }
}

function start(client: AgentClient, kind: WritebackTask['kind'], track: string, label: string, request: AgentTaskRequest): void {
  if (writing()) return
  const task = client.submit(request)
  writebacks.value.unshift({ id: task.id, kind, track, label, task, state: 'running', steps: 0, changes: [] })
  void follow(task.id, task)
}

/** The track's file, relative to the document directory. */
export const trackFile = (track: string) => `${LECTURES_DIR}/${track}/track.json`

/** "Narration from the transcript": a `transcript` task of the lecture, with what to write and where. */
export function sendNarration(client: AgentClient, track: string, label: string, prompt: string): void {
  start(client, 'narration', track, label, { kind: 'transcript', track, prompt, context: { document: '', view: 'lecture' } })
}

/**
 * "Translate": a `chat` task on the lecture's track. The context names the
 * track's file as the selection, so the task is not taken for drafting the
 * document (a chat whose context names the document only).
 */
export function sendTranslation(client: AgentClient, track: string, label: string, prompt: string): void {
  start(client, 'translation', track, label, { kind: 'chat', prompt, context: { document: '', view: 'lecture', selection: trackFile(track) } })
}

/** The sender's decision on the review: accept all, or reject all. */
export async function decide(id: string, accept: boolean): Promise<void> {
  const now = find(id)
  if (!now || now.state !== 'review') return
  now.state = 'deciding'
  try {
    await now.task.review(accept ? { accept: true } : { accept: false })
  } catch (error) {
    Object.assign(now, { state: 'failed', message: errorMessage(error) })
  }
}

/** Undoes the commit of a task (`git revert`, the assistant's route); conflicting files are reported. */
export async function revert(id: string, server: ServerClient): Promise<void> {
  const now = find(id)
  if (!now?.revision) return
  try {
    const response = await server.fetch(ASSISTANT, 'revert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: now.id }) })
    const answer = await response.json().catch(() => ({})) as { ok?: boolean, revision?: string, conflicts?: string[], error?: string }
    if (answer.ok && answer.revision) now.reverted = answer.revision
    else if (answer.conflicts) now.conflicts = answer.conflicts
    else now.message = answer.error ?? `HTTP ${response.status}`
  } catch (error) {
    now.message = errorMessage(error)
  }
}
