/**
 * Search tokenizer: words by `Intl.Segmenter`, so Chinese text without spaces
 * splits into words. VitePress serializes it into the client bundle, so it must
 * not refer to anything outside its own body.
 */
export function tokenize(text: string): string[] {
  const words: string[] = []
  for (const part of new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)) {
    if (part.isWordLike) words.push(part.segment)
  }
  return words
}
