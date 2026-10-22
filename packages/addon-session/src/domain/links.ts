import { isLoopback } from './config.ts'

const ROOM = /^[\w.-]{1,128}$/
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export interface JoinRequest {
  room: string
  name?: string
}

export function joinRequest(search: string): JoinRequest | undefined {
  const params = new URLSearchParams(search)
  const room = params.get('room')?.trim()
  if (!room || !ROOM.test(room)) return undefined
  const name = params.get('name')?.trim()
  return name ? { room, name } : { room }
}

export function joinUrl(base: string, room: string): string {
  const url = new URL(base)
  url.search = `?room=${encodeURIComponent(room)}`
  url.hash = ''
  return url.href
}

export function isLoopbackLink(link: string): boolean {
  try {
    return isLoopback(new URL(link).hostname)
  } catch {
    return false
  }
}

export function readableString(random: Uint8Array): string {
  return [...random].map(byte => ALPHABET[byte % ALPHABET.length]).join('')
}

export function archiveUrl(server: string, room: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString()
  return `${server.replace(/^ws(s?):/, 'http$1:')}/archive/${encodeURIComponent(room)}${query ? `?${query}` : ''}`
}
