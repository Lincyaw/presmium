import { useEffect } from 'react'
import { localeOf } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel/contracts'
import { installed } from './host-key.ts'
import { createStore, useStore } from './store.ts'
export type Catalog<T> = Record<Locale, T>
const language = createStore<string | undefined>(undefined)
let observer: MutationObserver | undefined
function observeLanguage() {
  if (typeof document === 'undefined' || observer) return
  language.set(document.documentElement.lang)
  observer = new MutationObserver(() => language.set(document.documentElement.lang))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
}
export function currentLocale(): Locale {
  const lang = typeof document === 'undefined' ? undefined : document.documentElement.lang
  return localeOf(lang || installed.adapter?.lang) ?? localeOf(typeof navigator === 'undefined' ? undefined : navigator.language) ?? 'en'
}
export function useLocale(): Locale { useStore(language); useEffect(observeLanguage, []); return currentLocale() }
export function useMessages<T>(catalog: Catalog<T>): T { return catalog[useLocale()] }
