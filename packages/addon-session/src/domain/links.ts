/** Room ids: as the classroom server accepts them, kept short for links and QR codes. */
const ROOM = /^[\w.-]{1,128}$/
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export interface JoinRequest {
  room: string
  /** Absent in a shared link: the learner is asked for a name. */
  name?: string
}

/** The classroom a page was opened to join: `?room=<id>&name=<name>`. */
export function joinRequest(search: string): JoinRequest | undefined {
  const params = new URLSearchParams(search)
  const room = params.get('room')?.trim()
  if (!room || !ROOM.test(room)) return undefined
  const name = params.get('name')?.trim()
  return name ? { room, name } : { room }
}

/** The link (and QR code) that joins a classroom: the deck's base URL with `?room=`. */
export function joinUrl(base: string, room: string): string {
  const url = new URL(base)
  url.search = `?room=${encodeURIComponent(room)}`
  url.hash = ''
  return url.href
}

/** A new room id from random bytes, e.g. `k7m2qx9a`. */
export function roomId(random: Uint8Array): string {
  return [...random].map(byte => ALPHABET[byte % ALPHABET.length]).join('')
}
