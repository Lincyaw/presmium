/**
 * UI strings of the publishing plugin in zh-CN and en (N-07), chosen as by
 * @presmium/host's useLocale: the page's language (`<html lang>`, which both
 * forms set from the deck) when it is zh-* or en-*, else the browser's, else
 * English.
 */
import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'

const zhCN = {
  highContrast: '高对比度',
  highContrastState: (on: boolean) => `高对比度：${on ? '开' : '关'}`,
}

export type PublishMessages = typeof zhCN

const en: PublishMessages = {
  highContrast: 'High contrast',
  highContrastState: on => `High contrast: ${on ? 'on' : 'off'}`,
}

/** 'zh-CN' for a zh-* tag, 'en' for en-*; undefined for languages without strings. */
function localeOf(tag: string): 'zh-CN' | 'en' | undefined {
  return /^zh(-|$)/i.test(tag) ? 'zh-CN' : /^en(-|$)/i.test(tag) ? 'en' : undefined
}

function detect(): 'zh-CN' | 'en' {
  // Server-side rendering has no page; the plugin's components render in the browser.
  if (typeof document === 'undefined') return 'zh-CN'
  return localeOf(document.documentElement.lang) ?? localeOf(navigator.language) ?? 'en'
}

const locale = ref(detect())
// A form may set <html lang> after the plugins start (Slidev applies its htmlAttrs at runtime).
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    locale.value = detect()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
}

/** The strings of the page's language, read when a string is needed. */
export function messages(): PublishMessages {
  return locale.value === 'en' ? en : zhCN
}

/** For components: the strings, following the page's language. */
export function useMessages(): ComputedRef<PublishMessages> {
  return computed(messages)
}
