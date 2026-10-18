import type { EnvironmentSpec } from '@presmium/kernel'
import { authOf, baseUrl, operatorVariables, originOf } from './config.ts'

export interface Connection {
  url: string
  headers: Record<string, string>
}

export type OperatorConnection =
  | { connection: Connection }
  | { unavailable: string }
  | { mismatch: string }

export interface OperatorSide {
  secret(name: string): string | undefined
}

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
