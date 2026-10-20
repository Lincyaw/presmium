import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Member, ReviewStep } from '@lincyaw/kernel'
import type { SavedGuard } from './git-guard.ts'
import type { GitDirs } from './git-review.ts'

export interface SessionRecord {
  session: string
  document: string
  member: Member
  turns: { from: number, to: number }
  opened: string
  checkpoints: string[]
  steps: ReviewStep[]
}

export interface ReviewRecord {
  deck: string
  dirs: GitDirs
  snapshot: string
  task: string
  pid: number
  started?: string
  guard?: SavedGuard
  session?: SessionRecord
}

export function recordsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'reviews')
}

const fileOf = (deck: string) => join(recordsDir(), `${createHash('sha256').update(deck).digest('hex').slice(0, 24)}.json`)

export function startTime(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  } catch {
    return undefined
  }
}

export const SELF = { pid: process.pid, started: startTime(process.pid) }

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
