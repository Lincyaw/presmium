import { DEFAULT_LANG } from './contracts/locale.ts'
import type { Locale } from './contracts/locale.ts'

export function localeOf(lang: string | null | undefined): Locale | undefined {
  const tag = lang?.trim().toLowerCase() ?? ''
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-CN'
  if (tag === 'en' || tag.startsWith('en-')) return 'en'
  return undefined
}

export function deckLocale(lang?: string): Locale {
  return localeOf(lang || DEFAULT_LANG) ?? 'en'
}

const HAN = /\p{Script=Han}/u
const LATIN_OR_DIGIT = /[A-Za-z0-9]/

/**
 * A zh-CN template whose values may be Chinese or Latin (a service, voice or environment name): it is written without
 * spaces around its values, and a half-width space goes wherever a Chinese character meets a Latin letter or digit
 * (docs/glossary.md section 2), so `zhSpaced\`发送给${provider}合成\`` reads “发送给火山引擎合成” and “发送给 Edge TTS 合成”.
 */
export function zhSpaced(strings: TemplateStringsArray, ...values: unknown[]): string {
  let text = strings[0]!
  const join = (next: string) => {
    const before = text.at(-1) ?? ''
    const after = next[0] ?? ''
    const space = (HAN.test(before) && LATIN_OR_DIGIT.test(after)) || (LATIN_OR_DIGIT.test(before) && HAN.test(after))
    text += space ? ` ${next}` : next
  }
  values.forEach((value, i) => {
    join(String(value))
    join(strings[i + 1]!)
  })
  return text
}
