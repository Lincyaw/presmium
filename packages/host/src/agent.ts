import { errorMessage } from '@presmium/kernel'
import type { AgentTask, AnnotationStatus, ReviewChange, ReviewStep } from '@presmium/kernel/contracts'
import type { Ref } from 'vue'
import { ref } from 'vue'

/** @experimental */
export interface AgentTaskState {
  state: 'running' | 'review' | 'deciding' | 'done' | 'failed'
  tool?: string
  note?: string
  steps: ReviewStep[]
  engine?: string
  changes: ReviewChange[]
  annotations: Record<string, { status: AnnotationStatus, note?: string }>
  revision?: string
  message?: string
}

/** @experimental */
export function trackAgentTask(task: AgentTask): Ref<AgentTaskState> {
  const state = ref<AgentTaskState>({ state: 'running', steps: [], changes: [], annotations: {} })
  const now = state.value
  void (async () => {
    try {
      for await (const event of task.events) {
        switch (event.type) {
          case 'progress':
            now.tool = event.status === 'running' ? event.tool ?? event.text : undefined
            now.note = event.text
            break
          case 'message':
            now.note = event.text
            break
          case 'step':
            now.steps.push(event.step)
            break
          case 'annotation':
            now.annotations[event.id] = { status: event.status, ...event.note === undefined ? {} : { note: event.note } }
            break
          case 'review':
            Object.assign(now, { state: 'review', engine: event.engine, changes: event.changes, steps: event.steps, tool: undefined, message: undefined })
            break
          case 'done':
            Object.assign(now, { state: 'done', tool: undefined, ...event.revision ? { revision: event.revision } : {} })
            break
          case 'error':
            Object.assign(now, { state: 'failed', tool: undefined, message: event.message })
            break
        }
      }
    } catch (error) {
      Object.assign(now, { state: 'failed', tool: undefined, message: errorMessage(error) })
    }
  })()
  return state
}
