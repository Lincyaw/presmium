/**
 * Who sends a request to the server (docs/architecture.md 10.3, 10.4). LOCAL
 * mode (`presmium dev`, a `serve` without a login): this machine only, the
 * one member is the local author (owner); `Host` and `Origin` must name this
 * machine. SHARED mode: only what the login proxy forwards (its shared secret
 * or a trusted address), the member from its identity headers, with the
 * roles the workspace gives; a request to the owner console's host name is
 * the console's, which takes changes only from its own page.
 */
import type { IncomingMessage } from 'node:http'
import type { Member, MemberRole } from '@presmium/kernel'
import { CONSOLE_HEADER } from './console.ts'
import { header, hostname, isLoopback, originHost, sameSecret } from './http.ts'
import type { SharedSetup } from './trust.ts'

/** The identity a login proxy passes (oauth2-proxy's headers). */
export interface Identity {
  user?: string
  email?: string
  name?: string
  groups: string[]
}

/** The member who uses `presmium dev`, or a `presmium serve` without a login. */
export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

export interface Auth {
  member: Member
  /** The request came to the owner console's host name. */
  console: boolean
}

/** Why a request is refused. */
export interface Refusal {
  status: number
  message: string
}

export interface AuthOptions {
  /** SHARED mode's setup; absent in LOCAL mode. */
  shared?: SharedSetup
  /** Addresses whose requests are trusted as coming from the login proxy (`--trust-proxy-from`). */
  trustProxyFrom?: string[]
  /** The roles of a member, from the workspace's `members`; default reader. */
  roles?(identity: Identity): MemberRole[]
}

/** The member of a request and whether it came to the console, or why it is refused; decided once per request. */
export function authenticator(options: AuthOptions): (req: IncomingMessage) => Auth | Refusal {
  const known = new WeakMap<IncomingMessage, Auth | Refusal>()
  const trusted = new Set(options.trustProxyFrom ?? [])
  return (req) => {
    let result = known.get(req)
    if (!result) known.set(req, result = identify(req, options, trusted))
    return result
  }
}

function identify(req: IncomingMessage, options: AuthOptions, trusted: ReadonlySet<string>): Auth | Refusal {
  const { shared } = options
  const host = header(req.headers, 'host')
  const origin = originHost(header(req.headers, 'origin'))
  if (!shared) {
    // LOCAL: this machine only, against DNS rebinding and other sites (10.3).
    if (!isLoopback(host)) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
    if (origin !== undefined && !isLoopback(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
    return { member: LOCAL_AUTHOR, console: false }
  }
  // SHARED: only what the login proxy forwards.
  const fromProxy = (shared.proxySecret && sameSecret(header(req.headers, 'x-presmium-proxy-secret'), shared.proxySecret))
    || trusted.has((req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''))
  if (!fromProxy) return { status: 403, message: 'requests must come through the login proxy' }
  const identity: Identity = {
    user: header(req.headers, 'x-forwarded-user'),
    email: header(req.headers, 'x-forwarded-email'),
    name: header(req.headers, 'x-forwarded-preferred-username'),
    groups: (header(req.headers, 'x-forwarded-groups') ?? '').split(',').map(group => group.trim()).filter(Boolean),
  }
  const id = identity.email ?? identity.user
  if (!id) return { status: 401, message: 'the login proxy passed no identity' }
  const roles = options.roles?.(identity) ?? []
  const member: Member = { id, name: identity.name ?? identity.user ?? id, ...identity.email ? { email: identity.email } : {}, roles: roles.length ? roles : ['reader'] }
  const console = hostname(host) === shared.consoleHost
  const method = (req.method ?? 'GET').toUpperCase()
  const upgrade = header(req.headers, 'upgrade') !== undefined
  if (console) {
    // The console takes requests from its own page only (10.4, WP-91), for its routes and its proxies alike: a
    // state change carries its Origin and `Presmium-Console`; a WebSocket its Origin; any other request that
    // a browser marks (Sec-Fetch-Site) comes from the same origin, except the page itself, which a link may open.
    const page = (method === 'GET' || method === 'HEAD') && new URL(req.url ?? '/', 'http://console').pathname === '/'
    if (method !== 'GET' && method !== 'HEAD' && (origin !== shared.consoleHost || header(req.headers, CONSOLE_HEADER) !== '1')) {
      return { status: 403, message: 'the owner console takes changes only from its own page' }
    }
    if (upgrade && origin !== shared.consoleHost) return { status: 403, message: 'the owner console takes WebSockets only from its own page' }
    const site = header(req.headers, 'sec-fetch-site')
    if (!page && site !== undefined && site !== 'same-origin') return { status: 403, message: 'the owner console takes requests only from its own page' }
  } else if ((upgrade || (method !== 'GET' && method !== 'HEAD')) && origin !== undefined && origin !== hostname(host)) {
    // State changes and WebSockets on the site come from the site.
    return { status: 403, message: 'cross-origin request' }
  }
  return { member, console }
}
