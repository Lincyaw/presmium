import { failedRun } from '@presmium/kernel'
import type { RunResult } from '@presmium/kernel'
import type { ComputeOutcome } from './compute.ts'
import { unavailable } from './compute.ts'
import type { WebgpuMessages } from './messages.ts'
import { failure, summary } from './summary.ts'

/** A run whose shader WebGPU rejected, or whose `:params:` are wrong: the program's own error, not a fallback. */
export function programError(id: string, message: string, durationMs: number): RunResult {
  const stderr = `${message}\n`
  return { ok: false, stdout: '', stderr, exitCode: 1, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stderr', text: stderr }] }
}

/**
 * The result of a run: its summary; a run that did not happen (`exitCode`
 * null, the reason in `stderr`), where the recorded output stands in; or
 * WebGPU's error.
 */
export function runResult(id: string, outcome: ComputeOutcome, durationMs: number, text: WebgpuMessages): RunResult {
  if (outcome.ok) {
    const stdout = summary(outcome, text)
    return { ok: true, stdout, stderr: '', exitCode: 0, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stdout', text: stdout }] }
  }
  return unavailable(outcome.reason) ? failedRun(id, failure(outcome, text), durationMs) : programError(id, failure(outcome, text), durationMs)
}
