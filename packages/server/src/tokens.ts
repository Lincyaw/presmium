/**
 * serve's scoped gateway tokens (D13, docs/architecture.md 10.9): issued with
 * serve's service token at the gateway's `/tokens` for one run, build, agent
 * session or proxy, each reaching the plugins named only, and revoked when
 * done. A proxy's token is kept and issued again before it expires.
 */
import { errorMessage } from '@presmium/kernel'
import type { GatewayAccess, Logger } from '@presmium/kernel'

export interface TokenRequest {
  /** The plugin ids it reaches. */
  plugins: string[]
  /** What it is for, e.g. `run:<document>`, `proxy:<plugin>`; the gateway logs it. */
  purpose: string
  /** The member it acts for. */
  member?: string
  /** Default an hour. */
  ttlSeconds?: number
}

export interface ScopedToken {
  /** The gateway's address and this token, for the one that uses it. */
  access: GatewayAccess
  id: string
  /** When it expires (ms since the epoch). */
  expires: number
  /** Revokes it; never throws. */
  revoke(): Promise<void>
}

/** A token kept this long before it expires is issued again. */
const RENEW_MS = 5 * 60_000

export class GatewayTokens {
  readonly #service: GatewayAccess
  readonly #base: string
  readonly #kept = new Map<string, Promise<ScopedToken>>()
  readonly #log?: Logger

  /** `service`: the gateway's address and serve's service token. */
  constructor(service: GatewayAccess, log?: Logger) {
    this.#service = service
    this.#base = service.url.replace(/\/+$/, '')
    this.#log = log
  }

  /** Issues a token; throws with the gateway's answer when it issues none. */
  async issue(request: TokenRequest): Promise<ScopedToken> {
    const response = await fetch(`${this.#base}/tokens`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.#service.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugins: request.plugins, purpose: request.purpose, ...request.member ? { member: request.member } : {}, ttlSeconds: request.ttlSeconds ?? 3600 }),
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`the gateway issued no token for ${request.purpose}: ${response.status} ${await response.text()}`)
    const body = (await response.json()) as { id: string, token: string, expires: string }
    return { access: { url: this.#service.url, token: body.token }, id: body.id, expires: Date.parse(body.expires), revoke: () => this.#revoke(body.id) }
  }

  /** A token kept under `key` (e.g. a document's proxy to a plugin): the same one until it nears its end, then a new one. */
  async kept(key: string, request: TokenRequest): Promise<ScopedToken> {
    const known = await this.#kept.get(key)?.catch(() => undefined)
    if (known && known.expires - Date.now() > RENEW_MS) return known
    const issuing = this.issue(request)
    this.#kept.set(key, issuing)
    issuing.catch(() => {
      if (this.#kept.get(key) === issuing) this.#kept.delete(key)
    })
    return issuing
  }

  /** Revokes the kept tokens whose key `which` picks (all by default). */
  async revokeKept(which: (key: string) => boolean = () => true): Promise<void> {
    const keys = [...this.#kept.keys()].filter(which)
    await Promise.all(keys.map(async (key) => {
      const issued = this.#kept.get(key)
      this.#kept.delete(key)
      await (await issued?.catch(() => undefined))?.revoke()
    }))
  }

  async #revoke(id: string): Promise<void> {
    try {
      await fetch(`${this.#base}/tokens/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${this.#service.token}` }, redirect: 'error', signal: AbortSignal.timeout(5000) })
    } catch (error) {
      this.#log?.warn(`the gateway did not revoke token ${id}: ${errorMessage(error)}`)
    }
  }
}
