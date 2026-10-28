import type { AuthoringClientActionResult } from '@lincyaw/kernel'

type Fragment = Extract<AuthoringClientActionResult, { jsonText: string }>
type Fields = 'offset' | 'endOffset' | 'totalUtf16' | 'totalUtf8' | 'sha256' | 'jsonText'
type FragmentBase = Fragment extends infer Value ? Value extends Fragment ? Omit<Value, Fields> : never : never
export const draftContentHash = async (text: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(value => value.toString(16).padStart(2, '0')).join('')
const boundary = (text: string, offset: number) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!))

/** Budget the complete client receipt and WS frame, preserving exact JSON text and Unicode progress. */
export async function authoringDraftFragment(options: { text: string, base: FragmentBase, offset: number, maxChars?: number }, current: () => void, fits: (value: AuthoringClientActionResult) => boolean): Promise<Fragment> {
  const { text, base, offset } = options, maxChars = options.maxChars ?? 2048
  const sha256 = await draftContentHash(text)
  current()
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length || !boundary(text, offset)) throw new Error(`client-${base.family}-offset-invalid`)
  if (!Number.isSafeInteger(maxChars) || maxChars < 2 || maxChars > 2048) throw new Error(`client-${base.family}-fragment-limit`)
  const lengths = { offset, totalUtf16: text.length, totalUtf8: new TextEncoder().encode(text).byteLength, sha256 }
  let low = offset, high = Math.min(text.length, offset + maxChars), best: Fragment | undefined
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const end = boundary(text, middle) ? middle : middle - 1
    const result: Fragment = { ...base, ...lengths, endOffset: end, jsonText: text.slice(offset, end) }
    if (fits(result)) { if (end > offset || end === text.length) best = result; low = middle + 1 }
    else high = middle - 1
  }
  if (!best) throw new Error(`client-${base.family}-fragment-too-large`)
  current()
  return best
}
