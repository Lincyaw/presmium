/**
 * Who sends a request to the server (docs/architecture.md 10.3): the one
 * member is the local author (owner), with no login. `Host` and `Origin`
 * must name this machine, against DNS rebinding and other sites: its
 * loopback names and, when `presmium serve --host` listens on the local
 * network (decision E-3, revised), the address it listens on (each address
 * of this machine's interfaces for `0.0.0.0` or `::`) and the machine's name.
 */
import type { IncomingMessage } from 'node:http'
import { hostname as machineName, networkInterfaces } from 'node:os'
import type { Member } from '@presmium/kernel'
import { header, hostname, isLoopback, originHost } from './http.ts'

/** The member who uses `presmium dev` and `presmium serve`. */
export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

/** Why a request is refused. */
export interface Refusal {
  status: number
  message: string
}

/** Whether a host name (`hostname`'s) names this machine. */
export type MachineHosts = (host: string) => boolean

/** Whether an address to listen on is that of every interface. */
export function anyAddress(host: string): boolean {
  return ['0.0.0.0', '[::]'].includes(hostname(host))
}

/** The IPv4 addresses of this machine's interfaces on its networks (not the loopback), where other devices reach it. */
export function networkAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal).map(entry => entry.address)
}

/**
 * The host names that name this machine for a server listening on `listen`:
 * the loopback ones; for an address of the local network, also that address
 * (for `0.0.0.0` or `::`, the address of each interface) and the machine's
 * name (and `<name>.local`).
 */
export function machineHosts(listen: string): MachineHosts {
  const own = hostname(listen)
  if (isLoopback(own)) return isLoopback
  const addresses = anyAddress(own)
    ? Object.values(networkInterfaces()).flatMap(entries => entries ?? []).map(entry => hostname(entry.address.replace(/%.*$/, '')))
    : [own]
  const name = machineName().toLowerCase()
  const names = new Set([...addresses, name, `${name}.local`])
  return host => isLoopback(host) || names.has(host)
}

/** The member of a request, or why it is refused; `local` names this machine (default: its loopback names only). */
export function authenticate(req: IncomingMessage, local: MachineHosts = isLoopback): Member | Refusal {
  const host = header(req.headers, 'host')
  const origin = originHost(header(req.headers, 'origin'))
  if (!local(hostname(host))) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
  if (origin !== undefined && !local(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
  return LOCAL_AUTHOR
}
