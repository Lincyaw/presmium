import type { RunResult } from '@lincyaw/kernel'
import { diffLines } from 'diff'
import { outputText } from './outputs.ts'

export function stringArgs(params: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(params ?? {}).map(([name, value]) => [name, value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)]))
}

export type RecordedOutput = string

export function withRecordedFallback(result: RunResult, recorded: RecordedOutput | undefined): RunResult {
  if (result.ok || recorded === undefined) return result
  return { ...result, stdout: recorded, source: 'recorded' }
}

export function fallbackReason(result: RunResult): 'timedOut' | 'failed' | undefined {
  if (result.source !== 'recorded') return undefined
  return result.timedOut ? 'timedOut' : 'failed'
}

export interface RunRecord {
  id: number
  args: Record<string, string>
  result: RunResult
}

export type RunHistory = readonly RunRecord[]

export function appendRun(history: RunHistory, args: Record<string, string>, result: RunResult): RunHistory {
  return [...history, { id: history.length + 1, args: { ...args }, result }]
}

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

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}
