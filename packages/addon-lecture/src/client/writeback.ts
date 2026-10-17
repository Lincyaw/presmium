/**
 * Writing a recorded lecture back (P-136, P-137): the lecture side only
 * builds the requests (design-v0.7 item 23); the agent service (`AGENT`, the
 * assistant's or another plugin's) runs each as a change task, reviews it
 * with its sender, commits it and undoes the commit (docs/architecture.md
 * 4.8). "Narration from the transcript" is a `transcript` task of the
 * lecture; "translate" a `chat` task whose context is the lecture's track
 * file. The tasks this window sent, newest first, follow their events with
 * the host's `trackAgentTask`: progress, the review (accept or reject all),
 * the commit and its undo (`AgentTask.revert`).
 */
import { trackAgentTask } from '@presmium/host'
import type { AgentTaskState } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import type { AgentClient, AgentTask, AgentTaskRequest } from '@presmium/kernel'
import { ref } from 'vue'
import { LECTURES_DIR } from '../domain/index.ts'

export interface WritebackTask {
  id: string
  kind: 'narration' | 'translation'
  track: string
  /** What the panel names it by. */
  label: string
  task: AgentTask
  /** The task as its events leave it (`trackAgentTask`, reactive); the panel sets `deciding` while its decision is sent. */
  state: AgentTaskState
  /** The commit that undid the task's, once undone. */
  reverted?: string
  conflicts?: string[]
  /** Why the undo failed. */
  message?: string
}

/** The tasks sent from this window's lecture panel, newest first. */
export const writebacks = ref<WritebackTask[]>([])

const find = (id: string) => writebacks.value.find(w => w.id === id)

/** A task of this window is under way or waits for its review: the agent takes one change task per document. */
export const writing = () => ['running', 'review', 'deciding'].includes(writebacks.value[0]?.state.state ?? '')

function start(client: AgentClient, kind: WritebackTask['kind'], track: string, label: string, request: AgentTaskRequest): void {
  if (writing()) return
  const task = client.submit(request)
  writebacks.value.unshift({ id: task.id, kind, track, label, task, state: trackAgentTask(task).value })
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
  if (!now || now.state.state !== 'review') return
  now.state.state = 'deciding'
  try {
    await now.task.review(accept ? { accept: true } : { accept: false })
  } catch (error) {
    Object.assign(now.state, { state: 'failed', message: errorMessage(error) })
  }
}

/** Undoes the commit of a task (`AgentTask.revert`); conflicting files are reported. */
export async function revert(id: string): Promise<void> {
  const now = find(id)
  if (!now?.state.revision) return
  try {
    const result = await now.task.revert()
    if (result.ok) now.reverted = result.revision
    else now.conflicts = result.conflicts
  } catch (error) {
    now.message = errorMessage(error)
  }
}
