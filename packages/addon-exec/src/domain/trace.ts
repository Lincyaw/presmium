import type { RunRequest } from '@presmium/kernel'
import { defineService } from '@presmium/kernel'

/** One executed line: its 1-based number and the cumulative output once it has run. */
export interface TraceEvent {
  line: number
  output: string
}

/** Line-by-line execution trace used for stepwise execution (P-21). */
export interface Trace {
  events: TraceEvent[]
  /** The run hit the event limit and was stopped. */
  truncated: boolean
  /** Set when tracing could not run at all (runtime failed to load, timed out). */
  error?: string
}

/** What step-by-step execution shows at one step. */
export interface TraceFrame {
  /** Step clamped to the trace: 0 before the first line, events.length after the last. */
  step: number
  /** The line that ran at this step; undefined at step 0. */
  line?: number
  output: string
}

/** Step k (1-based) shows the k-th executed line and the output accumulated up to it; step 0 shows nothing. */
export function frameAt(trace: Trace, step: number): TraceFrame {
  const at = Math.max(0, Math.min(step, trace.events.length))
  const event = trace.events[at - 1]
  return { step: at, line: event?.line, output: event?.output ?? '' }
}

/** Produces line traces; provided by executors that can trace (Pyodide for Python). */
export interface Tracer {
  supports(lang: string): boolean
  trace(request: RunRequest, signal?: AbortSignal): Promise<Trace>
}

export const TRACER = defineService<Tracer>('presmium.exec.tracer')
