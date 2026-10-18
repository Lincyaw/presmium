export function normalizeWhitespace(text: string): string {
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

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET
  for (const byte of new TextEncoder().encode(text)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME)
  }
  return hash.toString(16).padStart(16, '0')
}

export function fingerprint(text: string): string {
  return fnv1a64(normalizeWhitespace(text))
}
