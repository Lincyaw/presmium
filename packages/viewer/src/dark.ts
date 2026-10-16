import type { Ref } from 'vue'
import { readonly, shallowRef } from 'vue'

const dark = shallowRef(false)
let observed = false

/**
 * Whether the page shows its dark appearance: the `dark` class of `<html>`,
 * which VitePress sets and the appearance switch changes. Reactive; false in
 * a server render.
 */
export function useDark(): Readonly<Ref<boolean>> {
  if (!observed && typeof document !== 'undefined') {
    observed = true
    const root = document.documentElement
    dark.value = root.classList.contains('dark')
    new MutationObserver(() => {
      dark.value = root.classList.contains('dark')
    }).observe(root, { attributes: true, attributeFilter: ['class'] })
  }
  return readonly(dark)
}
