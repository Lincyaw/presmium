import type { Citation } from '@presmium/kernel'

const LINK = /\[([^\]\n]+)\]\(presmium:\/\/sections\/([^)\s/#?]+)(?:\/steps\/(\d+))?(?:#([^)\s]+))?\)/g

function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export type AnswerPart = { text: string, citation?: Citation }

export function answerParts(text: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let at = 0
  for (const match of text.matchAll(LINK)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) })
    const [, label, section, step, block] = match
    const citation: Citation = { label: label!, section: decoded(section!), ...step === undefined ? {} : { step: Number(step) }, ...block ? { block: decoded(block) } : {} }
    parts.push({ text: label!, citation })
    at = match.index + match[0].length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

export function citationsOf(text: string): Citation[] {
  return answerParts(text).flatMap(part => (part.citation ? [part.citation] : []))
}
