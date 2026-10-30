import { isRecord } from '@lincyaw/kernel'
import type { EnvironmentSpec } from '@lincyaw/kernel'
import type { Connection, OperatorSide } from '../domain/index.ts'

export class HubEnvironmentError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status = 502) { super(code); this.code = code; this.status = status }
}

/** Only operator-supplied addresses and the current owner's scoped token can reach the Hub. */
export async function prepareHubEnvironment(spec: EnvironmentSpec, side: OperatorSide, signal: AbortSignal): Promise<{ connection: Connection, generation: string }> {
  if (typeof spec.profile !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(spec.profile) || spec.url || spec.image) {
    throw new HubEnvironmentError('hub-profile-unavailable', 422)
  }
  const api = side.secret('JUPYTERHUB_API_URL')?.replace(/\/+$/, '')
  const proxy = side.secret('PRESMIUM_HUB_PROXY_URL')?.replace(/\/+$/, '')
  const token = side.secret('JUPYTERHUB_API_TOKEN')
  const user = side.secret('JUPYTERHUB_USER')
  if (!api || !proxy || !token || !user || ![api, proxy].every(value => /^https?:\/\//.test(value))) {
    throw new HubEnvironmentError('hub-not-configured', 503)
  }
  const profiles: unknown = JSON.parse(side.secret('PRESMIUM_HUB_PROFILES') || '[]')
  if (!Array.isArray(profiles) || !profiles.includes(spec.profile)) throw new HubEnvironmentError('hub-profile-unavailable', 422)
  const server = `env-${spec.profile}`
  const path = `/users/${encodeURIComponent(user)}`
  const headers = { Authorization: `token ${token}` }
  const request = (suffix: string, method = 'GET') => fetch(`${api}${path}${suffix}`, {
    method, headers, redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  })
  const state = async () => {
    const response = await request('')
    if (!response.ok) throw new HubEnvironmentError('hub-unavailable')
    const value: unknown = await response.json()
    const servers = isRecord(value) && isRecord(value.servers) ? value.servers : {}
    const found = servers[server]
    return isRecord(found) ? found : undefined
  }
  let current = await state()
  if (!current || (!current.ready && !current.pending)) {
    const response = await request(`/servers/${server}`, 'POST')
    if (!response.ok) {
      // Another document may have started this user's same profile concurrently.
      current = await state()
      if (!current?.ready && current?.pending !== 'spawn') {
        throw new HubEnvironmentError(response.status === 400 ? 'hub-profile-unavailable' : 'hub-start-failed')
      }
    }
  }
  const until = Date.now() + 240_000
  for (;;) {
    signal.throwIfAborted()
    current = await state()
    if (current?.ready) {
      return {
        connection: { url: `${proxy}/user/${encodeURIComponent(user)}/${server}/`, headers },
        generation: typeof current.started === 'string' ? current.started : '',
      }
    }
    if (!current || (!current.pending && current.stopped)) throw new HubEnvironmentError('hub-start-failed')
    if (Date.now() >= until) throw new HubEnvironmentError('hub-start-timeout', 504)
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 500)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
}
