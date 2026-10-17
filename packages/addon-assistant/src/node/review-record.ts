/**
 * The records of the git reviews under way (docs/architecture.md 10.7): one
 * file per document directory in `${XDG_STATE_HOME:-~/.local/state}/presmium/reviews/`,
 * outside every workspace (an agent cannot reach it), written when a review
 * opens and removed when it ends. A server that crashed (no rollback when it
 * ended) leaves its record: the next process that serves the document finds
 * it, with the process that wrote it gone, and restores the directory from
 * the snapshot it names.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SavedGuard } from './git-guard.ts'
import type { GitDirs } from './git-review.ts'

export interface ReviewRecord {
  /** The document directory (a real path). */
  deck: string
  /** Its work tree's top and git directories. */
  dirs: GitDirs
  /** The snapshot: the tree object of the directory when the task started. */
  snapshot: string
  task: string
  /** The process that holds the review, and when it started (Linux). */
  pid: number
  started?: string
  /** The repository's git directory as the task found it (a single-deck repository). */
  guard?: SavedGuard
}

export function recordsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'reviews')
}

const fileOf = (deck: string) => join(recordsDir(), `${createHash('sha256').update(deck).digest('hex').slice(0, 24)}.json`)

/** When a process started (clock ticks after boot, Linux); undefined elsewhere or when it is gone. */
export function startTime(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  } catch {
    return undefined
  }
}

/** This process, as its records name it. */
export const SELF = { pid: process.pid, started: startTime(process.pid) }

/** Whether the process that wrote a record still runs (the same process: same id and start). */
export function holderRuns(record: ReviewRecord): boolean {
  try {
    process.kill(record.pid, 0)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
  return record.started === undefined || startTime(record.pid) === record.started
}

export function readRecord(deck: string): ReviewRecord | undefined {
  try {
    return JSON.parse(readFileSync(fileOf(deck), 'utf8')) as ReviewRecord
  } catch {
    return undefined
  }
}

export function writeRecord(record: ReviewRecord): void {
  const file = fileOf(record.deck)
  mkdirSync(recordsDir(), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.${process.pid}`, JSON.stringify(record), { mode: 0o600 })
  renameSync(`${file}.${process.pid}`, file)
}

export function removeRecord(deck: string): void {
  rmSync(fileOf(deck), { force: true })
}
