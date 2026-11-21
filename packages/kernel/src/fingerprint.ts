function normalizeWhitespace(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/u, '').replace(/^[ \t]+/, lead => ' '.repeat(lead.replace(/\t/g, '    ').length)))
    .filter(line => line.length > 0)
  if (lines.length === 0) return ''
  const indent = Math.min(...lines.map(line => line.length - line.trimStart().length))
  return lines
    .map((line) => {
      const depth = line.length - line.trimStart().length - indent
      const body = line.trimStart().replace(/\s+/gu, ' ').replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1')
      return ' '.repeat(depth) + body
    })
    .join('\n')
}

/**
 * 64-bit FNV-1a of the text's UTF-8 bytes, as 16 hex digits. Computed in four 16-bit parts rather than with BigInt,
 * which took milliseconds per document: the prime is 2^40 + 0x1b3, so each step is `hash * 0x1b3 + (hash << 40)`.
 */
export function fnv1a64(text: string): string {
  // The offset basis 0xcbf29ce484222325, lowest part first.
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2
  for (const byte of new TextEncoder().encode(text)) {
    h0 ^= byte
    const t0 = h0 * 0x1b3, t1 = h1 * 0x1b3 + (t0 >>> 16), t2 = h2 * 0x1b3 + (t1 >>> 16) + ((h0 << 8) & 0xffff)
    const t3 = h3 * 0x1b3 + (t2 >>> 16) + (((h0 >>> 8) | (h1 << 8)) & 0xffff)
    h0 = t0 & 0xffff; h1 = t1 & 0xffff; h2 = t2 & 0xffff; h3 = t3 & 0xffff
  }
  return [h3, h2, h1, h0].map(part => part.toString(16).padStart(4, '0')).join('')
}

export function fingerprint(text: string): string {
  return fnv1a64(normalizeWhitespace(text))
}
