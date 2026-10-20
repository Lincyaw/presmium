import { localeOf } from '@lincyaw/kernel/contracts'
import type { Locale } from '@lincyaw/kernel/contracts'
import type { ComputedRef } from 'vue'
import { computed, getCurrentInstance, inject, shallowRef } from 'vue'
import { HOST, installed } from './key.ts'

export type Catalog<T> = Record<Locale, T>

const htmlLang = shallowRef<string>()
let observed = false

function observeHtmlLang(): void {
  if (observed || typeof document === 'undefined') return
  observed = true
  const root = document.documentElement
  htmlLang.value = root.lang
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      htmlLang.value = root.lang
    }).observe(root, { attributes: true, attributeFilter: ['lang'] })
  }
}

function resolveLocale(fallbackLang?: string): Locale {
  observeHtmlLang()
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language
  return localeOf(htmlLang.value || fallbackLang) ?? localeOf(browser) ?? 'en'
}

export function currentLocale(): Locale {
  return resolveLocale(installed.adapter?.lang)
}

export function useLocale(): ComputedRef<Locale> {
  const host = getCurrentInstance() ? inject(HOST, undefined) : undefined
  return computed(() => resolveLocale(host?.lang))
}

export function useMessages<T>(catalog: Catalog<T>): ComputedRef<T> {
  const locale = useLocale()
  return computed(() => catalog[locale.value])
}
