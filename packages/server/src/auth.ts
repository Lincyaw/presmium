import type { IncomingMessage } from 'node:http'
import { hostname, networkInterfaces } from 'node:os'
import { LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { Member } from '@lincyaw/kernel'
import { header, isLoopback, normalizeHostName, originHost } from './http.ts'

export interface Refusal {
  status: number
  message: string
}

export type MachineHosts = (host: string) => boolean

export function isAnyAddress(address: string): boolean {
  return ['0.0.0.0', '[::]'].includes(normalizeHostName(address))
}

export function machineHosts(listenAddress: string): MachineHosts {
  const own = normalizeHostName(listenAddress)
  if (isLoopback(own)) return isLoopback
  const addresses = isAnyAddress(own)
    ? Object.values(networkInterfaces()).flatMap(entries => entries ?? []).map(entry => normalizeHostName(entry.address.replace(/%.*$/, '')))
    : [own]
  const name = hostname().toLowerCase()
  const names = new Set([...addresses, name, `${name}.local`])
  return host => isLoopback(host) || names.has(host)
}

export function authenticate(req: IncomingMessage, local: MachineHosts = isLoopback): Member | Refusal {
  const host = header(req.headers, 'host')
  const origin = originHost(header(req.headers, 'origin'))
  if (!local(normalizeHostName(host))) return { status: 403, message: `Host ${host ?? '(none)'} is not this machine` }
  if (origin !== undefined && !local(origin)) return { status: 403, message: `Origin ${header(req.headers, 'origin')} is not this machine` }
  return LOCAL_AUTHOR
}
