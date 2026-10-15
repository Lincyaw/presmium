/** Plugin id; the deck configures it as `presmium: { presmium.session: { server } }`. */
export const SESSION_ID = 'presmium.session'

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
