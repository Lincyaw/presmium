import { useEffect } from 'react'
import { createStore, useStore } from '../store.ts'
import { useHost } from '../host.ts'
export interface Appearance { readonly dark: boolean, setDark(dark: boolean): void, toggle(): void }
const darkClass = createStore(false)
let observer: MutationObserver | undefined
function observe() { if (typeof document === 'undefined' || observer) return; const root = document.documentElement; const read = () => darkClass.set(root.classList.contains('dark')); read(); observer = new MutationObserver(read); observer.observe(root, { attributes: true, attributeFilter: ['class'] }) }
export function useAppearance(): Appearance {
  const host = useHost()
  const observed = useStore(darkClass)
  const own = host.useDarkMode?.()
  useEffect(observe, [])
  const dark = own?.[0] ?? observed
  const setDark = (on: boolean) => { if (own) own[1](on); else document.documentElement.classList.toggle('dark', on) }
  return { dark, setDark, toggle: () => setDark(!dark) }
}
