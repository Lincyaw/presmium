import type { ComputedRef } from 'vue'
import { computed, shallowRef } from 'vue'
import { localeOf, MESSAGES } from '../domain/index.ts'
import type { ClassroomMessages, Locale } from '../domain/index.ts'

const current = (): Locale => (typeof document === 'undefined' ? 'zh-CN' : localeOf(document.documentElement.lang, navigator.language))

/** The page's language: `<html lang>`, else the browser's; kept current when the host sets `lang` later. */
const locale = shallowRef(current())
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(() => locale.value = current()).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
}

/** The plugin's words in the page's language. */
export function messages(): ClassroomMessages {
  return MESSAGES[locale.value]
}

/** `messages()` for a component, updated when the page's language changes. */
export function useMessages(): ComputedRef<ClassroomMessages> {
  return computed(messages)
}
