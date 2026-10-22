import type { IncomingMessage } from 'node:http'
import { hostname as machineName, networkInterfaces } from 'node:os'
import type { Member } from '@lincyaw/kernel'
import { header, hostname, isLoopback, originHost } from './http.ts'

export const LOCAL_AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }

export interface Refusal {
  status: number
  message: string
}

export type MachineHosts = (host: string) => boolean

export function anyAddress(host: string): boolean {
  return ['0.0.0.0', '[::]'].includes(hostname(host))
}

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

export function authenticate(req: IncomingMessage, local: MachineHosts = isLoopback): Member | Refusal {
  const host = header(req.headers, 'host')
  const origin = originHost(header(req.headers, 'origin'))
  if (!local(hostname(host))) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
  if (origin !== undefined && !local(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
  return LOCAL_AUTHOR
}
