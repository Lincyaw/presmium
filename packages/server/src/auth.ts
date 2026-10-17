/**
 * Who sends a request to the server (docs/architecture.md 10.3): this
 * machine only, the one member is the local author (owner); `Host` and
 * `Origin` must name this machine, against DNS rebinding and other sites.
 */
import type { IncomingMessage } from 'node:http'
import type { Member } from '@presmium/kernel'
import { header, isLoopback, originHost } from './http.ts'

/** The member who uses `presmium dev` and `presmium serve`. */
export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

/** Why a request is refused. */
export interface Refusal {
  status: number
  message: string
}

/** The member of a request, or why it is refused. */
export function authenticate(req: IncomingMessage): Member | Refusal {
  const host = header(req.headers, 'host')
  const origin = originHost(header(req.headers, 'origin'))
  if (!isLoopback(host)) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
  if (origin !== undefined && !isLoopback(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
  return LOCAL_AUTHOR
}
