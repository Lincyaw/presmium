/**
 * The page's colour scheme (N-10): light or dark, as the host draws it with
 * the class `dark` on `<html>` (VitePress's appearance switch, Slidev's dark
 * mode). A host adapter that owns the switch gives it (`useDarkMode`), so a
 * change made here is the host's and is remembered as its own are.
 */
import type { Ref } from 'vue'
import { getCurrentInstance, inject, readonly, shallowRef } from 'vue'
import { HOST, installed } from '../key.ts'

export interface Theme {
  /** The page shows its dark scheme; reactive, false in a server render. */
  readonly dark: Readonly<Ref<boolean>>
  setDark(dark: boolean): void
  toggle(): void
}

const darkClass = shallowRef(false)
let observed = false

/** Follows the class `dark` of `<html>`. */
function observeDarkClass(): Ref<boolean> {
  if (!observed && typeof document !== 'undefined') {
    observed = true
    const root = document.documentElement
    darkClass.value = root.classList.contains('dark')
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        darkClass.value = root.classList.contains('dark')
      }).observe(root, { attributes: true, attributeFilter: ['class'] })
    }
  }
  return darkClass
}

/**
 * The colour scheme and its switch. In a component's setup it uses the host's
 * switch when the adapter has one; elsewhere, or without one, it follows and
 * sets the class of `<html>` itself.
 */
export function useTheme(): Theme {
  const host = getCurrentInstance() ? inject(HOST, undefined) : installed.adapter
  const own = getCurrentInstance() ? host?.useDarkMode?.() : undefined
  const dark = own ?? observeDarkClass()
  const setDark = (value: boolean) => {
    if (own) own.value = value
    else if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', value)
  }
  return {
    dark: readonly(dark),
    setDark,
    toggle: () => setDark(!dark.value),
  }
}
