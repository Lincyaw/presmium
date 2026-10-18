import type { Ref } from 'vue'
import { getCurrentInstance, inject, readonly, shallowRef } from 'vue'
import { createGlobalState, useMutationObserver } from '@vueuse/core'
import { HOST, installed } from '../key.ts'

export interface Theme {
  readonly dark: Readonly<Ref<boolean>>
  setDark(dark: boolean): void
  toggle(): void
}

const observeDarkClass = createGlobalState(() => {
  const root = () => typeof document === 'undefined' ? undefined : document.documentElement
  const dark = shallowRef(root()?.classList.contains('dark') ?? false)
  useMutationObserver(root, () => dark.value = root()?.classList.contains('dark') ?? false, { attributes: true, attributeFilter: ['class'] })
  return dark
})

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
