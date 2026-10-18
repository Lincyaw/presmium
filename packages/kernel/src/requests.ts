export interface RequestHeaders {
  host?: string | string[]
  origin?: string | string[]
  'sec-fetch-site'?: string | string[]
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function hostName(value: string): string {
  const host = value.includes('://') ? value.slice(value.indexOf('://') + 3) : value
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1).toLowerCase()
  return host.split(':')[0]!.toLowerCase()
}

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
