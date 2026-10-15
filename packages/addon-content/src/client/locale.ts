import { localeOf, MESSAGES } from '../domain/index.ts'
import type { ContentMessages } from '../domain/index.ts'

/** The plugin's words in the page's language: `<html lang>`, else the browser's. */
export function messages(): ContentMessages {
  return MESSAGES[typeof document === 'undefined' ? 'zh-CN' : localeOf(document.documentElement.lang, navigator.language)]
}
