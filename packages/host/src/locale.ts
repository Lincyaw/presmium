/**
 * The UI language (N-07). Both forms put the deck language in `<html lang>`;
 * a component reads it through `useLocale` and picks its messages from a
 * catalog with `useMessages`. Where the deck language has no messages,
 * `navigator.language` decides, then English.
 */
import { localeOf } from '@presmium/kernel/contracts'
import type { Locale } from '@presmium/kernel/contracts'
import type { ComputedRef } from 'vue'
import { computed, getCurrentInstance, inject, shallowRef } from 'vue'
import { HOST, installed } from './key.ts'

/** Messages of a package in each UI language. */
export type Catalog<T> = Record<Locale, T>

const htmlLang = shallowRef<string>()
let observed = false

/** Follows `<html lang>`, which a host may change (e.g. VitePress on navigation). */
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

/**
 * The UI language now, outside a component (e.g. when a service is created
 * or a view is labelled): as `useLocale`; in a render without a document,
 * the deck language of the installed host.
 */
export function currentLocale(): Locale {
  return resolveLocale(installed.adapter?.lang)
}

/**
 * The UI language: `<html lang>` (in a render without a document, the host's
 * deck language), else `navigator.language`, else English; reactive.
 */
export function useLocale(): ComputedRef<Locale> {
  const host = getCurrentInstance() ? inject(HOST, undefined) : undefined
  return computed(() => resolveLocale(host?.lang))
}

/** The messages of `catalog` in the UI language; reactive. */
export function useMessages<T>(catalog: Catalog<T>): ComputedRef<T> {
  const locale = useLocale()
  return computed(() => catalog[locale.value])
}
