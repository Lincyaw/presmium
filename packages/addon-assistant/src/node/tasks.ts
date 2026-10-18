/**
 * The assistant's tasks in this process (docs/domain-model.md section 13):
 * each with its member, kind and document, and its events, kept for a page
 * that follows them (from the first, as SSE) until a while after the task
 * ended; the pages following a task are counted. A change task waiting for
 * its review keeps the resolver of the decision and the return to a step.
 * Tasks live in memory only (a change task's review has a record on disk
 * while it is open, kept by the review's engine: the workspace service's git
 * review, or deltabox's).
 */
import type { AgentEvent, AgentTaskKind, AgentTaskRequest, Member, ReviewDecision } from '@presmium/kernel'

export interface Task {
  id: string
  member: Member
  kind: AgentTaskKind
  /** The document directory, relative to the workspace root. */
  document: string
  /** What was asked (a change task's, for a page that comes back to it). */
  request?: AgentTaskRequest
  events: AgentEvent[]
  /** The pages following its events now. */
  followers: number
  /** Told when `followers` changes. */
  attended?: () => void
  ended: boolean
  wake: Set<() => void>
  abort: AbortController
  /** The writes outside the document directory owners allowed (absolute paths): a change task commits them. */
  allowed?: Set<string>
  /** While a change task waits for its review: takes the decision. */
  decide?: (decision: ReviewDecision) => void
  /** While a change task waits for its review, when its review can: back to before a step, then the review again. */
  restore?: (step: string) => Promise<void>
  /** The task's run: settles once it ended (a closing server waits for it). */
  run?: Promise<void>
}

/** How long an ended task's events stay for a page that reconnects. */
const KEPT_MS = 10 * 60_000

export class Tasks {
  readonly #tasks = new Map<string, Task>()

  get(id: string): Task | undefined {
    return this.#tasks.get(id)
  }

  has(id: string): boolean {
    return this.#tasks.has(id)
  }

  create(id: string, member: Member, kind: AgentTaskKind, document: string, request?: AgentTaskRequest): Task {
    const task: Task = { id, member, kind, document, ...request ? { request } : {}, events: [], followers: 0, ended: false, wake: new Set(), abort: new AbortController() }
    this.#tasks.set(id, task)
    return task
  }

  push(task: Task, event: AgentEvent): void {
    task.events.push(event)
    for (const wake of task.wake) wake()
  }

  end(task: Task, event: AgentEvent): void {
    if (task.ended) return
    this.push(task, event)
    task.ended = true
    for (const wake of task.wake) wake()
    setTimeout(() => this.#tasks.delete(task.id), KEPT_MS).unref?.()
  }

  /** A task's events from the first, until it ended or `signal` aborts; counted among its followers meanwhile. */
  async* follow(task: Task, signal: AbortSignal): AsyncIterable<{ data: AgentEvent }> {
    let next = 0
    task.followers++
    task.attended?.()
    try {
      for (;;) {
        while (next < task.events.length) yield { data: task.events[next++]! }
        if (task.ended || signal.aborted) return
        await new Promise<void>((resolve) => {
          const wake = () => {
            task.wake.delete(wake)
            resolve()
          }
          task.wake.add(wake)
          signal.addEventListener('abort', wake, { once: true })
        })
      }
    } finally {
      task.followers--
      task.attended?.()
    }
  }

  /** Aborts every task and waits for their runs (a change task waiting for its review is rejected). */
  async close(): Promise<void> {
    const runs: Promise<void>[] = []
    for (const task of this.#tasks.values()) {
      task.abort.abort()
      if (task.run) runs.push(task.run)
    }
    await Promise.allSettled(runs)
  }
}
