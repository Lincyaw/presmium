/**
 * UI strings of the publishing plugin in zh-CN and en (N-07). The language is
 * the page's (`<html lang>`, which both forms set from the deck), else the
 * browser's; Chinese for zh-*, English otherwise.
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

function detect(): 'zh-CN' | 'en' {
  // Server-side rendering has no page; the plugin's components render in the browser.
  if (typeof document === 'undefined') return 'zh-CN'
  return /^zh\b/i.test(document.documentElement.lang || navigator.language) ? 'zh-CN' : 'en'
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
