/**
 * Collapses whitespace so that re-indentation, blank lines and spacing around
 * punctuation do not change the text, while whitespace between two words
 * (`return x` vs `returnx`) is kept as a single space.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1')
    .trim()
}

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n

/** 64-bit FNV-1a over UTF-8 bytes, as 16 hex digits. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET
  for (const byte of new TextEncoder().encode(text)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME)
  }
  return hash.toString(16).padStart(16, '0')
}

/** Content fingerprint used by anchors: the hash of the whitespace-normalized text. */
export function fingerprint(text: string): string {
  return fnv1a64(normalizeWhitespace(text))
}
