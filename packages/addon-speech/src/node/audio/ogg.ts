interface Page {
  flags: number
  granule: bigint
  serial: number
  sequence: number
  segments: number[]
  body: Uint8Array
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const CRC = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    table[i] = r >>> 0
  }
  return table
})()

function crc(bytes: Uint8Array): number {
  let value = 0
  for (const byte of bytes) value = ((value << 8) ^ CRC[((value >>> 24) ^ byte) & 0xff]!) >>> 0
  return value
}

export function isOgg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS'
}

function pages(bytes: Uint8Array): Page[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Page[] = []
  let at = 0
  while (at + 27 <= bytes.length) {
    if (String.fromCharCode(...bytes.subarray(at, at + 4)) !== 'OggS') throw new Error(`not an Ogg page at byte ${at}`)
    const count = bytes[at + 26]!
    const segments = [...bytes.subarray(at + 27, at + 27 + count)]
    const length = segments.reduce((n, s) => n + s, 0)
    const start = at + 27 + count
    if (start + length > bytes.length) throw new Error('the last Ogg page is cut short')
    out.push({ flags: bytes[at + 5]!, granule: view.getBigInt64(at + 6, true), serial: view.getUint32(at + 14, true), sequence: view.getUint32(at + 18, true), segments, body: bytes.subarray(start, start + length) })
    at = start + length
  }
  return out
}

function pageBytes(page: Page): Uint8Array {
  const out = new Uint8Array(27 + page.segments.length + page.body.length)
  const view = new DataView(out.buffer)
  out.set(encoder.encode('OggS'), 0)
  out[5] = page.flags
  view.setBigInt64(6, page.granule, true)
  view.setUint32(14, page.serial, true)
  view.setUint32(18, page.sequence, true)
  out[26] = page.segments.length
  out.set(page.segments, 27)
  out.set(page.body, 27 + page.segments.length)
  view.setUint32(22, crc(out), true)
  return out
}

function commentHeader(all: Page[]): { end: number, packet: Uint8Array } {
  const parts: Uint8Array[] = []
  for (let i = 1; i < all.length; i++) {
    const page = all[i]!
    if (page.serial !== all[0]!.serial) throw new Error('an Ogg file of several streams')
    parts.push(page.body)
    if (page.segments.at(-1)! < 255) {
      const packet = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let at = 0
      for (const part of parts) {
        packet.set(part, at)
        at += part.length
      }
      if (String.fromCharCode(...packet.subarray(0, 8)) !== 'OpusTags') throw new Error('the second Ogg packet is not an Opus comment header')
      return { end: i, packet }
    }
  }
  throw new Error('the Ogg file ends inside its comment header')
}

function parseTags(packet: Uint8Array): { vendor: Uint8Array, comments: Uint8Array[], rest: Uint8Array } {
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
  let at = 8
  const vendorLength = view.getUint32(at, true)
  const vendor = packet.subarray(at + 4, at + 4 + vendorLength)
  at += 4 + vendorLength
  const count = view.getUint32(at, true)
  at += 4
  const comments: Uint8Array[] = []
  for (let i = 0; i < count; i++) {
    const length = view.getUint32(at, true)
    comments.push(packet.subarray(at + 4, at + 4 + length))
    at += 4 + length
  }
  return { vendor, comments, rest: packet.subarray(at) }
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

export function opusComments(bytes: Uint8Array): string[] {
  return parseTags(commentHeader(pages(bytes)).packet).comments.map(comment => decoder.decode(comment))
}

export function withOpusComment(bytes: Uint8Array, comment: string): Uint8Array {
  const all = pages(bytes)
  const { end, packet } = commentHeader(all)
  const tags = parseTags(packet)
  const comments = [...tags.comments, encoder.encode(comment)]
  const parts = [encoder.encode('OpusTags'), u32(tags.vendor.length), tags.vendor, u32(comments.length), ...comments.flatMap(c => [u32(c.length), c]), tags.rest]
  const header = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    header.set(part, at)
    at += part.length
  }
  const lacing = [...Array<number>(Math.floor(header.length / 255)).fill(255), header.length % 255]
  const rebuilt: Page[] = []
  let offset = 0
  for (let i = 0; i < lacing.length; i += 255) {
    const segments = lacing.slice(i, i + 255)
    const length = segments.reduce((n, s) => n + s, 0)
    const last = i + 255 >= lacing.length
    rebuilt.push({ flags: i === 0 ? 0 : 1, granule: last ? 0n : -1n, serial: all[0]!.serial, sequence: 1 + rebuilt.length, segments, body: header.subarray(offset, offset + length) })
    offset += length
  }
  const shift = rebuilt.length - end
  const later = all.slice(end + 1).map(page => ({ ...page, sequence: page.sequence + shift }))
  const out = [all[0]!, ...rebuilt, ...later].map(pageBytes)
  const result = new Uint8Array(out.reduce((n, p) => n + p.length, 0))
  at = 0
  for (const page of out) {
    result.set(page, at)
    at += page.length
  }
  return result
}

export function oggOpusDuration(bytes: Uint8Array): number {
  const all = pages(bytes)
  const head = all[0]?.body
  if (!head || String.fromCharCode(...head.subarray(0, 8)) !== 'OpusHead') return 0
  const preSkip = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true)
  const granule = all.filter(page => page.granule >= 0n).at(-1)?.granule ?? 0n
  return Math.max(0, Number(granule) - preSkip) / 48000
}
