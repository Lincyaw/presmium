import { mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { serveStateDir } from './service-state.ts'

const lockfile = createRequire(import.meta.url)('proper-lockfile') as {
  lock(file: string, options: { realpath: boolean, retries: number, onCompromised(error: Error): void }): Promise<() => Promise<void>>
}

/** One workspace writer across Studio, serve and MCP processes. */
export interface ServiceHostLease {
  readonly root: string
  /** Losing the underlying lock requires closing the host before accepting more work. */
  readonly signal: AbortSignal
  release(): Promise<void>
}

/** One attempt; callers may wait for the existing host's published state instead of obtaining its lease. */
export async function tryAcquireServiceHostLease(root: string, env: NodeJS.ProcessEnv = process.env): Promise<ServiceHostLease | undefined> {
  const canonical = realpathSync(root), directory = serveStateDir(canonical, env)
  mkdirSync(directory, { recursive: true })
  const controller = new AbortController()
  let unlock: () => Promise<void>
  try {
    unlock = await lockfile.lock(join(directory, 'host'), { realpath: false, retries: 0, onCompromised: error => controller.abort(error) })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED') return undefined
    throw error
  }
  let releasing: Promise<void> | undefined
  return { root: canonical, signal: controller.signal,
    release: () => releasing ??= unlock().catch(error => { if (!controller.signal.aborted) throw error }),
  }
}
