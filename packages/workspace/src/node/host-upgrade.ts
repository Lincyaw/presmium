import { isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route } from '@lincyaw/kernel'
import { compareServiceVersion, SERVICE_VERSION } from '@lincyaw/kernel/node'
import type { DocumentLocks } from './locks.ts'
import type { Jobs } from './jobs.ts'

/** Only the launcher's authenticated owner route can release this host for a newer runtime. */
export function hostUpgradeRoute(locks: DocumentLocks, jobs: Jobs, quiesce: () => boolean, upgrade: (version: string) => void): Route {
  let upgrading = false
  return { role: 'owner', maxBody: 1024, async handle(request) {
    if (request.method !== 'POST') return problemResponse(405, 'POST')
    const body: unknown = await request.json().catch(() => undefined)
    if (!isRecord(body) || body.pid !== process.pid || typeof body.version !== 'string' || Object.keys(body).some(key => !['pid', 'version'].includes(key))) return problemResponse(400, 'host-upgrade-invalid')
    try {
      if (compareServiceVersion({ version: SERVICE_VERSION }, body.version) >= 0) return problemResponse(409, 'host-upgrade-version')
    } catch { return problemResponse(400, 'host-upgrade-invalid') }
    if (upgrading) return jsonResponse({ upgrading: true })
    if (jobs.list().some(job => job.state === 'running' || job.state === 'queued')) return problemResponse(409, 'host-upgrade-busy')
    const release = locks.claim('', 'upgrade')
    if (!release) return problemResponse(409, 'host-upgrade-busy')
    if (!quiesce()) { release(); return problemResponse(409, 'host-upgrade-busy') }
    // Hold the workspace-wide write lock until the host closes. The response must leave before closing HTTP.
    upgrading = true
    const version = body.version
    setTimeout(() => upgrade(version), 0)
    return jsonResponse({ upgrading: true })
  } }
}
