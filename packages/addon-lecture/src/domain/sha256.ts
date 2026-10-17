/**
 * SHA-256 (FIPS 180-4) of a text's UTF-8 bytes, in plain TypeScript: the
 * digest a translation records of its original (P-137), which the player
 * compares where the page has no `crypto.subtle` (a page served over plain
 * http from another machine is no secure context).
 */

const K = new Uint32Array([
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
])

const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** The hex SHA-256 of `text` (UTF-8). */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  // The message, a 1 bit, zeros, and its length in bits (64-bit big-endian), to a multiple of 64 bytes.
  const length = Math.ceil((bytes.length + 9) / 64) * 64
  const message = new Uint8Array(length)
  message.set(bytes)
  message[bytes.length] = 0x80
  const view = new DataView(message.buffer)
  view.setUint32(length - 8, Math.floor(bytes.length / 0x20000000))
  view.setUint32(length - 4, bytes.length * 8)
  const h = new Uint32Array([0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19])
  const w = new Uint32Array(64)
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotate(w[i - 15]!, 7) ^ rotate(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotate(w[i - 2]!, 17) ^ rotate(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = w[i - 16]! + s0 + w[i - 7]! + s1
    }
    const v = [...h]
    for (let i = 0; i < 64; i++) {
      const [a, b, c, d, e, f, g, hh] = v as [number, number, number, number, number, number, number, number]
      const t1 = (hh + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      v.splice(0, 8, (t1 + t2) >>> 0, a, b, c, (d + t1) >>> 0, e, f, g)
    }
    // A Uint32Array keeps each sum modulo 2^32.
    v.forEach((x, i) => h[i] = h[i]! + x)
  }
  return [...h].map(word => word.toString(16).padStart(8, '0')).join('')
}
