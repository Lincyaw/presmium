import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isRecord } from '../errors.ts'

/** What a running Presmium server records for local clients: its address, its MCP endpoint and token, its process. */
export interface ServiceState {
  url: string
  mcp: string
  token: string
  pid: number
}

/** The state directory of the workspace service (`presmium serve`, and the one `presmium studio` starts) of `root`. */
export function serveStateDir(root: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(base, 'presmium', 'serve', createHash('sha256').update(root).digest('hex').slice(0, 16))
}

/** The state file `presmium dev` writes beside the document it previews. */
export function devStateFile(deckDir: string): string {
  return join(deckDir, '.presmium', 'server.json')
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The state of the server that wrote `file`, while that process runs. */
export function readServiceState(file: string): ServiceState | undefined {
  try {
    const state: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isRecord(state) || typeof state.url !== 'string' || typeof state.mcp !== 'string' || typeof state.token !== 'string' || typeof state.pid !== 'number') return undefined
    return alive(state.pid) ? { url: state.url, mcp: state.mcp, token: state.token, pid: state.pid } : undefined
  } catch {
    return undefined
  }
}

/** Removes `file` when it is still this process's: a server that stopped leaves no address behind. */
export function removeServiceState(file: string, pid = process.pid): void {
  try {
    const state: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (isRecord(state) && state.pid === pid) rmSync(file, { force: true })
  } catch {}
}
