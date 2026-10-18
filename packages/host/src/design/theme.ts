import type { Ref } from 'vue'
import { getCurrentInstance, inject, readonly, shallowRef } from 'vue'
import { HOST, installed } from '../key.ts'

export interface Theme {
  readonly dark: Readonly<Ref<boolean>>
  setDark(dark: boolean): void
  toggle(): void
}

const darkClass = shallowRef(false)
let observed = false

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
