import type { EnvironmentSpec } from '@presmium/kernel'
import { authOf, baseUrl, operatorVariables, originOf } from './config.ts'

/** Where to reach a Jupyter Server, and the headers every request and WebSocket handshake carries (the credentials). */
export interface Connection {
  /** The server's base URL, ending with `/`. */
  url: string
  headers: Record<string, string>
}

/**
 * Where the server side (the build, the dev server's proxy, `probe`)
 * connects to an environment: a connection; or why it does not connect, as
 * `unavailable` (runs fail with this reason) or `mismatch` (an error of the
 * deck, which names another address than the operator's). The reasons do
 * not name the environment; callers do.
 */
export type OperatorConnection =
  | { connection: Connection }
  | { unavailable: string }
  | { mismatch: string }

export interface OperatorSide {
  /** The process's environment variables (`EnvironmentContext.secret`, `ServerContext.secret`). */
  secret(name: string): string | undefined
}

/**
 * The credential rules of docs/architecture.md section 11 and docs/ir.md 2.7.
 * `none`: the deck's `url`, without a token. `env`, `proxy` and `prompt`
 * (a build has no learner to paste a token): the operator's pair
 * `PRESMIUM_ENV_<NAME>_URL` and `PRESMIUM_ENV_<NAME>_TOKEN`; the token goes
 * to that address only. Without the address nothing connects and no token
 * is sent; a deck `url` of another origin is a mismatch, and nothing
 * connects either; there is no generic fallback variable. `hub` is reserved.
 */
export function operatorConnection(name: string, spec: EnvironmentSpec, side: OperatorSide): OperatorConnection {
  const auth = authOf(spec)
  if (auth === 'hub') return { unavailable: 'auth: hub is reserved and not available yet' }
  if (auth === 'none') {
    const url = typeof spec.url === 'string' ? spec.url : undefined
    if (!originOf(url)) return { unavailable: 'auth: none connects to the deck\'s url, which is missing or not an http(s) address' }
    return { connection: { url: baseUrl(url!), headers: {} } }
  }
  const variables = operatorVariables(name)
  const url = side.secret(variables.url)
  if (!url) return { unavailable: `${variables.url} is not set: the operator gives the environment's address there, and its token (${variables.token}) is sent to that address only` }
  const origin = originOf(url)
  if (!origin) return { unavailable: `${variables.url} is not an http(s) address` }
  const deck = typeof spec.url === 'string' && spec.url ? spec.url : undefined
  if (deck && originOf(deck) !== origin) {
    return { mismatch: `the deck's url ${deck} is not the operator's address (${variables.url}, ${origin}); the operator's token goes to the operator's address only, so nothing connects. Leave the url out, or write the operator's` }
  }
  const token = side.secret(variables.token)
  return { connection: { url: baseUrl(url), headers: token ? { Authorization: `token ${token}` } : {} } }
}
