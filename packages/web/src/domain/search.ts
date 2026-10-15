/**
 * Search tokenizer: splits at spaces and punctuation like MiniSearch's default
 * tokenizer (so `console.log` gives `console` and `log`), then into words by
 * `Intl.Segmenter`, so Chinese text without spaces splits into words.
 * VitePress serializes it into the client bundle, so it must not refer to
 * anything outside its own body.
 */
export function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  const words: string[] = []
  for (const piece of text.split(/[\n\r\p{Z}\p{P}]+/u)) {
    for (const part of segmenter.segment(piece)) {
      if (part.isWordLike) words.push(part.segment)
    }
  }
  return words
}
