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
  label: string
  task: AgentTask
  state: AgentTaskState
  reverted?: string
  conflicts?: string[]
  message?: string
}

export const writebacks = ref<WritebackTask[]>([])

const find = (id: string) => writebacks.value.find(w => w.id === id)

export const writing = () => ['running', 'review', 'deciding'].includes(writebacks.value[0]?.state.state ?? '')

function start(client: AgentClient, kind: WritebackTask['kind'], track: string, label: string, request: AgentTaskRequest): void {
  if (writing()) return
  const task = client.submit(request)
  writebacks.value.unshift({ id: task.id, kind, track, label, task, state: trackAgentTask(task).value })
}

export const trackFile = (track: string) => `${LECTURES_DIR}/${track}/track.json`

export function sendNarration(client: AgentClient, track: string, label: string, prompt: string): void {
  start(client, 'narration', track, label, { kind: 'transcript', track, prompt, context: { document: '', view: 'lecture' } })
}

export function sendTranslation(client: AgentClient, track: string, label: string, prompt: string): void {
  start(client, 'translation', track, label, { kind: 'chat', prompt, context: { document: '', view: 'lecture', selection: trackFile(track) } })
}

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
