import type { RunRequest } from '@presmium/kernel'
import { defineService } from '@presmium/kernel'

export interface TraceEvent {
  line: number
  output: string
}

export interface Trace {
  events: TraceEvent[]
  truncated: boolean
  error?: string
}

export interface TraceFrame {
  step: number
  line?: number
  output: string
}

export function frameAt(trace: Trace, step: number): TraceFrame {
  const at = Math.max(0, Math.min(step, trace.events.length))
  const event = trace.events[at - 1]
  return { step: at, line: event?.line, output: event?.output ?? '' }
}

export interface Tracer {
  supports(lang: string): boolean
  trace(request: RunRequest, signal?: AbortSignal): Promise<Trace>
}

export const TRACER = defineService<Tracer>('presmium.exec.tracer')
