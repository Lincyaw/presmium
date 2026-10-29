import { CloudError } from '../domain/errors.ts'
import type { CloudUser } from './auth.ts'
import type { CloudConfig } from './config.ts'

export type StudioState = 'stopped' | 'starting' | 'running' | 'stopping'

interface HubUser { name: string, servers?: Record<string, { ready?: boolean, pending?: string | null, stopped?: boolean }> }

/**
 * The console as a JupyterHub service: its token may create users, start and stop their servers, and reach the
 * cloud's control service inside them (`/user/<name>/cloud/`). Sign-in to Studio itself is JupyterHub's.
 */
export class Hub {
  readonly config: CloudConfig['hub']
  constructor(config: CloudConfig['hub']) { this.config = config }

  /** The Hub user of a console user: both name the user by the OIDC subject. */
  name(user: CloudUser): string {
    const name = user.subject.toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name)) throw new CloudError(422, 'hub-user-name-invalid')
    return name
  }

  async #api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.config.apiUrl}${path}`, { ...init, headers: { authorization: `token ${this.config.token}`, ...init.headers as Record<string, string> }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  }

  async state(name: string): Promise<StudioState> {
    const response = await this.#api(`/users/${encodeURIComponent(name)}`)
    if (response.status === 404) return 'stopped'
    if (!response.ok) throw new CloudError(502, 'hub-unavailable')
    const server = (await response.json() as HubUser).servers?.['']
    if (!server) return 'stopped'
    if (server.pending === 'stop') return 'stopping'
    if (server.pending) return 'starting'
    return server.ready ? 'running' : 'starting'
  }

  async start(name: string): Promise<StudioState> {
    const created = await this.#api(`/users/${encodeURIComponent(name)}`, { method: 'POST' })
    if (!created.ok && created.status !== 409) throw new CloudError(502, 'hub-unavailable')
    const started = await this.#api(`/users/${encodeURIComponent(name)}/server`, { method: 'POST' })
    // 201 started, 202 starting; 400 when it already runs or is still stopping.
    if (!started.ok && started.status !== 400) throw new CloudError(502, 'hub-unavailable')
    return this.state(name)
  }

  async stop(name: string): Promise<StudioState> {
    const stopped = await this.#api(`/users/${encodeURIComponent(name)}/server`, { method: 'DELETE' })
    if (!stopped.ok && stopped.status !== 400 && stopped.status !== 404) throw new CloudError(502, 'hub-unavailable')
    return this.state(name)
  }

  /** Starts the user's Studio if needed and waits until it answers. */
  async running(name: string, timeoutMs = 240_000): Promise<void> {
    const until = Date.now() + timeoutMs
    let state = await this.state(name)
    if (state === 'stopped') state = await this.start(name)
    while (state !== 'running') {
      if (Date.now() > until) throw new CloudError(504, 'studio-start-timeout')
      await new Promise(done => setTimeout(done, 1000))
      state = await this.state(name)
      if (state === 'stopped') state = await this.start(name)
    }
  }

  /** The cloud's control service in the user's running Studio, through the Hub's proxy. */
  async control(name: string, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    const { timeoutMs = 30_000, ...rest } = init
    const response = await fetch(`${this.config.proxyUrl}/user/${encodeURIComponent(name)}/cloud${path}`, {
      ...rest, headers: { ...rest.headers as Record<string, string>, authorization: `token ${this.config.token}` },
      redirect: 'manual', signal: rest.signal ?? AbortSignal.timeout(timeoutMs), ...rest.body ? { duplex: 'half' } : {},
    } as RequestInit)
    if (response.status >= 300 && response.status < 400) throw new CloudError(409, 'studio-not-running')
    if (!response.ok && path !== '/mcp') {
      const body = await response.json().catch(() => ({})) as { error?: unknown }
      throw new CloudError(response.status === 404 ? 404 : response.status === 422 ? 422 : 502, typeof body.error === 'string' && /^[a-z-]{1,64}$/.test(body.error) ? body.error : 'studio-control-failed')
    }
    return response
  }

  /** Where the browser opens the user's Studio (JupyterHub signs in, starts it and redirects), optionally on a document. */
  openUrl(target?: { document: string, id: string }): string {
    const url = new URL('/hub/user-redirect/presmium', this.config.publicUrl)
    if (target) { url.searchParams.set('document', target.document); url.searchParams.set('id', target.id) }
    return url.href
  }
}
