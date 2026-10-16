/**
 * The helper's records of its deltabox sessions (`<state>/presmium/sessions/<id>.json`),
 * which let a later helper recover the sessions of one that is gone. A
 * helper is named by its pid and its start time, so a pid used again by
 * another process, or a helper of another installation sharing the state
 * directory, is told apart.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SessionRecord {
  session: string
  kind: 'review' | 'run' | 'probe'
  project: string
  /** The session's view (`mountpoint`); its directory is deltabox's runtime directory of the session. */
  mount?: string
  /** A review's copy of the document directory when it opened. */
  snapshot?: string
  helper: { pid: number, started: string }
}

export const recordsDir = (stateDir: string) => join(stateDir, 'presmium', 'sessions')

/** A process's start time since boot (`/proc/<pid>/stat`, field 22); undefined when it is gone. */
export function startTime(pid: number): string | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  } catch {
    return undefined
  }
}

export function alive(helper: SessionRecord['helper']): boolean {
  return startTime(helper.pid) === helper.started
}

/** The records whose helper is gone, by file name. */
export function orphans(stateDir: string): [string, SessionRecord][] {
  let names: string[] = []
  try {
    names = readdirSync(recordsDir(stateDir)).filter(name => name.endsWith('.json'))
  } catch {}
  return names.flatMap((name): [string, SessionRecord][] => {
    try {
      const record = JSON.parse(readFileSync(join(recordsDir(stateDir), name), 'utf8')) as SessionRecord
      return alive(record.helper) ? [] : [[name, record]]
    } catch {
      return []
    }
  })
}
