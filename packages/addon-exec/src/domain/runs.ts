import type { RunResult } from '@presmium/kernel'
import { diffLines } from 'diff'

/** Output recorded ahead of time, shown when a run fails or times out (P-24). */
export type RecordedOutput = string

/**
 * P-24: a failed or timed-out run shows the recorded output instead, marked as
 * `source: 'recorded'`; the live stderr and `timedOut` are kept to explain why.
 */
export function withRecordedFallback(result: RunResult, recorded: RecordedOutput | undefined): RunResult {
  if (result.ok || recorded === undefined) return result
  return { ...result, stdout: recorded, source: 'recorded' }
}

/** Why a recorded output is shown; undefined for live output. */
export function fallbackReason(result: RunResult): string | undefined {
  if (result.source !== 'recorded') return undefined
  return result.timedOut ? '执行超时' : '执行失败'
}

/** One run of a code block. Run records stay in the current view and are never written back. */
export interface RunRecord {
  /** 1-based, in run order. */
  id: number
  args: Record<string, string>
  result: RunResult
}

/** The runs of one code block in the current view, oldest first; any two can be compared. */
export type RunHistory = readonly RunRecord[]

export function appendRun(history: RunHistory, args: Record<string, string>, result: RunResult): RunHistory {
  return [...history, { id: history.length + 1, args: { ...args }, result }]
}

/** The two records compared by default: the last two runs. */
export function defaultPair(history: RunHistory): [number, number] | undefined {
  const n = history.length
  return n >= 2 ? [history[n - 2]!.id, history[n - 1]!.id] : undefined
}

export interface ArgChange {
  name: string
  before?: string
  after?: string
}

export interface OutputLine {
  kind: 'same' | 'added' | 'removed'
  text: string
}

export interface RunComparison {
  before: RunRecord
  after: RunRecord
  args: ArgChange[]
  output: OutputLine[]
  changed: boolean
}

/** Compares two runs: changed arguments and a line diff of their output. */
export function compareRuns(before: RunRecord, after: RunRecord): RunComparison {
  const names = [...new Set([...Object.keys(before.args), ...Object.keys(after.args)])]
  const args = names
    .filter(name => before.args[name] !== after.args[name])
    .map(name => ({ name, before: before.args[name], after: after.args[name] }))
  const output = diffLines(outputText(before.result), outputText(after.result)).flatMap(change =>
    splitLines(change.value).map((text): OutputLine => ({ kind: change.added ? 'added' : change.removed ? 'removed' : 'same', text })),
  )
  return { before, after, args, output, changed: output.some(line => line.kind !== 'same') }
}

function outputText(result: RunResult): string {
  return result.stderr && result.source === 'live' ? `${result.stdout}${result.stderr}` : result.stdout
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}
