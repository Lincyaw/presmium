import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import semver from 'semver'
import { readServiceState, serveStateDir } from './service-state.ts'
import type { ServiceState } from './service-state.ts'
import { tryAcquireServiceHostLease } from './service-lease.ts'

export class ServiceUpgradeError extends Error {
  readonly reason: 'busy' | 'newer' | 'unavailable'
  readonly version?: string
  constructor(reason: 'busy' | 'newer' | 'unavailable', version?: string) {
    super(`workspace-service-upgrade-${reason}`)
    this.reason = reason
    this.version = version
  }
}

/** A newer stdio relay can use the current host; a Studio must match its host's version. */
export function compareServiceVersion(state: Pick<ServiceState, 'version'>, version: string): number {
  return state.version && semver.valid(state.version) ? semver.compare(state.version, version) : -1
}

/** Release one older local host before electing its replacement. Never kill a replacement or bypass its lease. */
export async function upgradeWorkspaceService(root: string, state: ServiceState, version: string, env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Promise<void> {
  if (compareServiceVersion(state, version) >= 0) throw new ServiceUpgradeError('newer', state.version)
  const file = join(serveStateDir(root, env), 'server.json')
  const same = () => { const current = readServiceState(file); return current?.pid === state.pid && current.token === state.token }
  const url = new URL(state.url)
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password || !state.launcherToken) throw new ServiceUpgradeError('unavailable')
  const timeout = AbortSignal.any([AbortSignal.timeout(30_000), ...signal ? [signal] : []])
  const request = (path: string, body: unknown) => fetch(`${state.url.replace(/\/$/, '')}/__presmium/presmium.workspace/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${state.launcherToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: timeout, redirect: 'error',
  })
  try {
    let response: Response | undefined
    while (same()) {
      response = await request('host-upgrade', { pid: state.pid, version })
      await response.arrayBuffer()
      if (response.status !== 409) break
      try { await delay(100, undefined, { signal: timeout }) } catch { throw new ServiceUpgradeError('busy') }
    }
    if (response?.status === 404 || response?.status === 405) {
      // Hosts released before the handover protocol require a graceful process stop. Authenticate the
      // published launcher first, and recheck its identity immediately before signalling that exact process.
      const legacy = await request('preview-origins', { origins: [] })
      await legacy.arrayBuffer()
      if (!legacy.ok) throw new ServiceUpgradeError('unavailable')
      if (same()) process.kill(state.pid, 'SIGTERM')
    } else if (response && !response.ok) throw new ServiceUpgradeError('unavailable')
  } catch (error) {
    if (same()) {
      if (error instanceof ServiceUpgradeError) throw error
      throw new ServiceUpgradeError('unavailable')
    }
  }
  try {
    for (;;) {
      const current = readServiceState(file)
      if (current && !same()) return
      if (!current) {
        const lease = await tryAcquireServiceHostLease(root, env)
        if (lease) { await lease.release(); return }
      }
      await delay(50, undefined, { signal: timeout })
    }
  } catch { throw new ServiceUpgradeError('unavailable') }
}
