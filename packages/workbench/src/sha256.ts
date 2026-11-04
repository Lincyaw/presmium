import { sha256 as hash } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/** The same SHA-256 fingerprint on HTTPS, localhost and LAN HTTP. */
export async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)
  const subtle = globalThis.crypto?.subtle
  return bytesToHex(subtle ? new Uint8Array(await subtle.digest('SHA-256', bytes)) : hash(bytes))
}
