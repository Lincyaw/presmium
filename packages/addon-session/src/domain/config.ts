export const SESSION_ID = 'presmium.session'

export const SYNC_PATH = 'sync'

export interface LocalClassroom {
  path: string
  document: string
}

export function localServer(answer: LocalClassroom, page: { protocol: string, host: string }): { server: string, params: Record<string, string> } {
  return { server: `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}${answer.path}`, params: { document: answer.document } }
}

export interface SessionConfig {
  server?: string
}

export function sessionConfig(config: Record<string, unknown>): SessionConfig {
  const server = typeof config.server === 'string' ? config.server.trim() : ''
  if (!server) return {}
  return { server: server.replace(/^http(s?):\/\//, 'ws$1://').replace(/\/+$/, '') }
}

export function isLoopback(hostname: string): boolean {
  return /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(hostname)
}

export function reachableServer(server: string, pageHost: string): string {
  let url: URL
  try {
    url = new URL(server)
  } catch {
    return server
  }
  if (!pageHost || !isLoopback(url.hostname) || isLoopback(pageHost)) return server
  url.hostname = pageHost
  return url.href.replace(/\/+$/, '')
}
