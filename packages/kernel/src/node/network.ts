import { networkInterfaces } from 'node:os'

/** This machine's IPv4 addresses on its local networks, for printing the addresses other devices can use. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal).map(entry => entry.address)
}

/** The host as a URL writes it: an IPv6 address in brackets. */
export function bracketIPv6(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
}
