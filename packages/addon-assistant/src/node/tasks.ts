import type { AgentEvent, AgentTaskKind, AgentTaskRequest, Member, ReviewDecision } from '@presmium/kernel'

export interface Task {
  id: string
  member: Member
  kind: AgentTaskKind
  document: string
  request?: AgentTaskRequest
  events: AgentEvent[]
  followers: number
  attended?: () => void
  ended: boolean
  wake: Set<() => void>
  abort: AbortController
  allowed?: Set<string>
  decide?: (decision: ReviewDecision) => void
  restore?: (step: string) => Promise<void>
  run?: Promise<void>
}

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

  async close(): Promise<void> {
    const runs: Promise<void>[] = []
    for (const task of this.#tasks.values()) {
      task.abort.abort()
      if (task.run) runs.push(task.run)
    }
    await Promise.allSettled(runs)
  }
}
