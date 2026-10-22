const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

export function codeColumns(code: string): number {
  let widest = 0
  for (const line of code.split('\n')) {
    let width = 0
    for (const char of line) width += char === '\t' ? 4 : WIDE.test(char) ? 2 : 1
    widest = Math.max(widest, width)
  }
  return widest
}
