import { failedRun } from '@presmium/kernel'
import type { RunResult } from '@presmium/kernel'
import type { ComputeOutcome } from './compute.ts'
import { unavailable } from './compute.ts'
import type { WebgpuMessages } from './messages.ts'
import { failure, summary } from './summary.ts'

export function programError(id: string, message: string, durationMs: number): RunResult {
  const stderr = `${message}\n`
  return { ok: false, stdout: '', stderr, exitCode: 1, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stderr', text: stderr }] }
}

export function runResult(id: string, outcome: ComputeOutcome, durationMs: number, text: WebgpuMessages): RunResult {
  if (outcome.ok) {
    const stdout = summary(outcome, text)
    return { ok: true, stdout, stderr: '', exitCode: 0, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stdout', text: stdout }] }
  }
  return unavailable(outcome.reason) ? failedRun(id, failure(outcome, text), durationMs) : programError(id, failure(outcome, text), durationMs)
}
