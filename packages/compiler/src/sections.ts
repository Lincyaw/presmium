import type { MdastNode } from '@lincyaw/kernel'

export function plainText(node: MdastNode): string {
  if (typeof node.value === 'string' && !node.children) return node.value
  return (node.children ?? []).map(plainText).join('')
}

/**
 * The section ID a heading's text gives. Unlike the kernel's urlSlug, other characters are dropped rather than
 * replaced, and only spaces, `_` and `-` become `-`; the IDs of existing documents depend on this rule.
 */
export function sectionSlug(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '-') || 'section'
}

export function unique(id: string, used: Set<string>): string {
  let result = id
  for (let n = 2; used.has(result); n++) result = `${id}-${n}`
  used.add(result)
  return result
}
