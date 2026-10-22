import type { WordSpan } from '@lincyaw/kernel'

export interface LexiconText {
  text: string
  spans: WordSpan[]
}

export function applyLexiconWithSpans(text: string, lexicon: Record<string, string> | undefined): LexiconText {
  const entries = Object.entries(lexicon ?? {}).filter(([written]) => written.length > 0).sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return { text, spans: [] }
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(entries.map(([written]) => escape(written)).join('|'), 'g')
  const spokenForm = new Map(entries)
  const spans: LexiconText['spans'] = []
  let spoken = ''
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const replacement = spokenForm.get(match[0]) ?? match[0]
    spoken += text.slice(last, match.index)
    spans.push({ from: spoken.length, to: spoken.length + replacement.length, start: match.index, end: match.index + match[0].length })
    spoken += replacement
    last = match.index + match[0].length
  }
  return { text: spoken + text.slice(last), spans }
}

export function applyLexicon(text: string, lexicon: Record<string, string> | undefined): string {
  return applyLexiconWithSpans(text, lexicon).text
}
