import { failedRun } from '@lincyaw/kernel'
import type { RunResult } from '@lincyaw/kernel'
import type { ComputeOutcome } from './compute.ts'
import { isUnavailable } from './compute.ts'
import type { WebgpuMessages } from './messages.ts'
import { failureText, summaryText } from './summary.ts'

export function programError(id: string, message: string, durationMs: number): RunResult {
  const stderr = `${message}\n`
  return { ok: false, stdout: '', stderr, exitCode: 1, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stderr', text: stderr }] }
}

/** The run's result: a summary of the buffers, or why the GPU could not run the shader (a failed run) or the shader failed (a program error). */
export function runResultOf(id: string, outcome: ComputeOutcome, durationMs: number, text: WebgpuMessages): RunResult {
  if (outcome.ok) {
    const stdout = summaryText(outcome, text)
    return { ok: true, stdout, stderr: '', exitCode: 0, durationMs, timedOut: false, source: 'live', executorId: id, outputs: [{ output_type: 'stream', name: 'stdout', text: stdout }] }
  }
  return isUnavailable(outcome.reason) ? failedRun(id, failureText(outcome, text), durationMs) : programError(id, failureText(outcome, text), durationMs)
}
