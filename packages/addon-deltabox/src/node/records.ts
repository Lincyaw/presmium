import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SessionRecord {
  session: string
  kind: 'review' | 'run' | 'probe'
  project: string
  mount?: string
  snapshot?: string
  helper: { pid: number, started: string }
}

export const recordsDir = (stateDir: string) => join(stateDir, 'presmium', 'sessions')

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
