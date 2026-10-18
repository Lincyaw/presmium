const LANGUAGES: Record<string, string> = { zh: 'Simplified Chinese (zh-CN)', en: 'English' }

export function language(lang: string | undefined): string {
  const tag = lang?.trim() || 'zh-CN'
  return LANGUAGES[tag.toLowerCase().split('-')[0]!] ?? tag
}
