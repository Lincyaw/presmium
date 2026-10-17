/**
 * Following an agent's task in a page (docs/architecture.md 4.8): its events
 * folded into one state that panels show, the same for the assistant's edit
 * panel, the lecture's write-back panel and any other sender of change tasks.
 */
import { errorMessage } from '@presmium/kernel'
import type { AgentTask, AnnotationStatus, ReviewChange, ReviewStep } from '@presmium/kernel/contracts'
import type { Ref } from 'vue'
import { ref } from 'vue'

export interface AgentTaskState {
  /**
   * `running` until the task waits for its sender's review (`review`) or
   * ends; `deciding` once a decision or a return to a step is sent (the
   * panel sets it); then `done` or `failed`.
   */
  state: 'running' | 'review' | 'deciding' | 'done' | 'failed'
  /** The tool the agent is using now. */
  tool?: string
  /** The agent's latest message or progress text. */
  note?: string
  /** The review checkpoints so far (a `review` event gives them again, as they are then). */
  steps: ReviewStep[]
  /** The review's engine, e.g. `deltabox` or `git`. */
  engine?: string
  /** The changes the review shows. */
  changes: ReviewChange[]
  /** The annotations' statuses and notes, by annotation id. */
  annotations: Record<string, { status: AnnotationStatus, note?: string }>
  /** The commit, once the task is done with one. */
  revision?: string
  /** Why the task failed. */
  message?: string
}

/**
 * The state of a task, updated from its events until it ends (`done` or
 * `error`). The panel may change it besides (e.g. `deciding` while its
 * review decision is sent).
 */
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
            // Again after a return to before a step: the changes and steps as they are now.
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
