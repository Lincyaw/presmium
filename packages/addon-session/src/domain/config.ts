/** Plugin id; the deck configures it as `presmium: { presmium.session: { server } }`. */
export const SESSION_ID = 'presmium.session'

/**
 * Where `presmium dev` and `presmium serve` sync the classroom on their own
 * port: `/__presmium/presmium.session/<SYNC_PATH>/<room>`, the classroom
 * server's protocol; the route `classroom` says it for a page's document.
 */
export const SYNC_PATH = 'sync'

/** The answer of the route `classroom`: the path of the sync, and the document a page names there (`?document=`). */
export interface LocalClassroom {
  path: string
  document: string
}

/** The classroom server of a page's own server, from the route's answer: its WebSocket URL at the page's host, and the parameters it takes. */
export function localServer(answer: LocalClassroom, page: { protocol: string, host: string }): { server: string, params: Record<string, string> } {
  return { server: `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}${answer.path}`, params: { document: answer.document } }
}

export interface SessionConfig {
  /** WebSocket URL of the classroom server; none: the deck works alone and the session cannot connect. */
  server?: string
}

/** The plugin's options; an `http(s)://` server address becomes `ws(s)://`. */
export function sessionConfig(config: Record<string, unknown>): SessionConfig {
  const server = typeof config.server === 'string' ? config.server.trim() : ''
  if (!server) return {}
  return { server: server.replace(/^http(s?):\/\//, 'ws$1://').replace(/\/+$/, '') }
}

/** A loopback host name: `localhost`, `127.x.x.x` or `::1`. */
export function isLoopback(hostname: string): boolean {
  return /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(hostname)
}

/**
 * The classroom server as a page on `pageHost` reaches it. A server on a
 * loopback host (as `presmium-classroom-server` prints it) is on the machine
 * that serves the deck; a learner's device that opened the deck on the
 * network reaches that machine at the page's host instead.
 */
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
