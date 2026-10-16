/**
 * WAV (RIFF) files: their chunks, a `LIST`/`INFO` chunk appended without
 * changing the others (the AI-generated label, docs/ir.md 9.1), the
 * duration, and the fake engine's 16-bit PCM files.
 */

export interface RiffChunk {
  id: string
  data: Uint8Array
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length))
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A chunk's bytes: id, size, data and the pad byte of an odd size. */
function chunkBytes(id: string, data: Uint8Array): Uint8Array {
  return concat([encoder.encode(id.padEnd(4, ' ').slice(0, 4)), u32(data.length), data, data.length % 2 ? new Uint8Array(1) : new Uint8Array(0)])
}

export function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE'
}

/** The chunks after `WAVE`; a size larger than the file (a streamed WAV that never wrote it) ends at the file's end. */
export function wavChunks(bytes: Uint8Array): RiffChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: RiffChunk[] = []
  let at = 12
  while (at + 8 <= bytes.length) {
    const size = Math.min(view.getUint32(at + 4, true), bytes.length - at - 8)
    chunks.push({ id: ascii(bytes, at, 4), data: bytes.subarray(at + 8, at + 8 + size) })
    at += 8 + size + (size % 2)
  }
  return chunks
}

function riff(chunks: RiffChunk[]): Uint8Array {
  const body = concat([encoder.encode('WAVE'), ...chunks.map(chunk => chunkBytes(chunk.id, chunk.data))])
  return concat([encoder.encode('RIFF'), u32(body.length), body])
}

/** The file with a `LIST`/`INFO` chunk of these entries (four-character ids) appended; the other chunks are kept as they are. */
export function withInfo(bytes: Uint8Array, entries: [string, string][]): Uint8Array {
  const info = concat([encoder.encode('INFO'), ...entries.map(([id, value]) => chunkBytes(id, encoder.encode(`${value}\0`)))])
  return riff([...wavChunks(bytes), { id: 'LIST', data: info }])
}

/** The entries of the file's `LIST`/`INFO` chunks, by id. */
export function infoEntries(bytes: Uint8Array): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const chunk of wavChunks(bytes)) {
    if (chunk.id !== 'LIST' || ascii(chunk.data, 0, 4) !== 'INFO') continue
    const view = new DataView(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
    let at = 4
    while (at + 8 <= chunk.data.length) {
      const size = Math.min(view.getUint32(at + 4, true), chunk.data.length - at - 8)
      entries[ascii(chunk.data, at, 4)] = decoder.decode(chunk.data.subarray(at + 8, at + 8 + size)).replace(/\0+$/, '')
      at += 8 + size + (size % 2)
    }
  }
  return entries
}

/** Seconds of PCM audio: the `data` chunk's size over the byte rate of `fmt `. */
export function wavDuration(bytes: Uint8Array): number {
  const chunks = wavChunks(bytes)
  const fmt = chunks.find(chunk => chunk.id === 'fmt ')
  const data = chunks.find(chunk => chunk.id === 'data')
  if (!fmt || !data || fmt.data.length < 12) return 0
  const byteRate = new DataView(fmt.data.buffer, fmt.data.byteOffset, fmt.data.byteLength).getUint32(8, true)
  return byteRate ? data.data.length / byteRate : 0
}

/** A mono 16-bit PCM WAV with further chunks between `fmt ` and `data`. */
export function makeWav(samples: Int16Array, rate: number, extra: RiffChunk[] = []): Uint8Array {
  const fmt = new Uint8Array(16)
  const view = new DataView(fmt.buffer)
  view.setUint16(0, 1, true)
  view.setUint16(2, 1, true)
  view.setUint32(4, rate, true)
  view.setUint32(8, rate * 2, true)
  view.setUint16(12, 2, true)
  view.setUint16(14, 16, true)
  const data = new Uint8Array(samples.length * 2)
  const pcm = new DataView(data.buffer)
  samples.forEach((sample, i) => pcm.setInt16(i * 2, sample, true))
  return riff([{ id: 'fmt ', data: fmt }, ...extra, { id: 'data', data }])
}
