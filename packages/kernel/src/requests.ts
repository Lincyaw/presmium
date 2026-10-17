/**
 * Whether a request to a local dev server comes from this machine's pages
 * (architecture.md 10.2). Dev servers listen on loopback, but a page from
 * another site can still reach them: by DNS rebinding (a name of its own that
 * resolves to 127.0.0.1, so the request is same-origin and carries that
 * name as `Host`), or by a plain cross-site request (an image or a form, with
 * `Sec-Fetch-Site: cross-site`). Endpoints that Presmium adds to a dev server
 * run before Vite's own host and CORS checks, so they check here.
 */
export interface RequestHeaders {
  host?: string | string[]
  origin?: string | string[]
  'sec-fetch-site'?: string | string[]
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** The host name of a `Host` header or an origin, lower case, without the port. */
export function hostName(value: string): string {
  const host = value.includes('://') ? value.slice(value.indexOf('://') + 3) : value
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1).toLowerCase()
  return host.split(':')[0]!.toLowerCase()
}

/**
 * Why a request may not use a local endpoint, or undefined when it may.
 * `allowedHosts` is the dev server's own setting: `true` (a site served under
 * any name, such as a SHARED site behind serve) skips the host check, a list
 * adds names to loopback.
 */
export function localRequestRefusal(headers: RequestHeaders, allowedHosts?: true | readonly string[]): string | undefined {
  if (first(headers['sec-fetch-site']) === 'cross-site') return 'cross-site request'
  if (allowedHosts === true) return undefined
  const allowed = (name: string) => LOOPBACK.has(name) || (allowedHosts ?? []).some(host => host.startsWith('.') ? name.endsWith(host) || name === host.slice(1) : name === host.toLowerCase())
  const host = first(headers.host)
  if (!host || !allowed(hostName(host))) return `Host ${host ?? '(none)'} is not this machine`
  const origin = first(headers.origin)
  if (origin && origin !== 'null' && !allowed(hostName(origin))) return `Origin ${origin} is not this machine`
  return undefined
}
