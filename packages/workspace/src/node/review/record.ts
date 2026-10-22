import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Member, ReviewStep } from '@lincyaw/kernel'
import type { SavedGitDir } from './git-guard.ts'
import type { GitDirs } from './git-review.ts'

export interface AgentSessionRecord {
  session: string
  document: string
  member: Member
  turns: { from: number, to: number }
  opened: string
  checkpoints: string[]
  steps: ReviewStep[]
}

/** A review in progress, kept in the user's state directory so that another process can roll it back or resume it. */
export interface ReviewRecord {
  /** The directory the review covers: a document's for a plugin's task, the workspace root for an agent session. */
  scopeDir: string
  dirs: GitDirs
  snapshot: string
  task: string
  pid: number
  started?: string
  guard?: SavedGitDir
  session?: AgentSessionRecord
}

export function recordsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'reviews')
}

const recordFile = (scopeDir: string) => join(recordsDir(), `${createHash('sha256').update(scopeDir).digest('hex').slice(0, 24)}.json`)

export function processStartTime(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  } catch {
    return undefined
  }
}

export const THIS_PROCESS = { pid: process.pid, started: processStartTime(process.pid) }

export function isHolderAlive(record: ReviewRecord): boolean {
  try {
    process.kill(record.pid, 0)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
  return record.started === undefined || processStartTime(record.pid) === record.started
}

/** Reads the record of a review of the directory; records of earlier versions name the directory `deck`. */
export function readRecord(scopeDir: string): ReviewRecord | undefined {
  try {
    const { deck, ...record } = JSON.parse(readFileSync(recordFile(scopeDir), 'utf8')) as Partial<ReviewRecord> & { deck?: string }
    return { ...record, scopeDir: record.scopeDir ?? deck } as ReviewRecord
  } catch {
    return undefined
  }
}

export function writeRecord(record: ReviewRecord): void {
  const file = recordFile(record.scopeDir)
  mkdirSync(recordsDir(), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.${process.pid}`, JSON.stringify(record), { mode: 0o600 })
  renameSync(`${file}.${process.pid}`, file)
}

export function removeRecord(scopeDir: string): void {
  rmSync(recordFile(scopeDir), { force: true })
}
