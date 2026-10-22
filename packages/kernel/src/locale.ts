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
