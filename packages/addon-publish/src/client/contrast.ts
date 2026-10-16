import { readonly, ref } from 'vue'
import type { Ref } from 'vue'
import { markDimmed, raiseDimmedLines } from './code-lines.ts'
import { adoptShadows, styleDiagrams } from './diagrams.ts'

/**
 * High-contrast preference (P-52), shared by both forms. When on, `<html>`
 * carries `data-pm-contrast="high"` and contrast.css switches its CSS
 * variables; diagrams and dimmed code lines follow (diagrams.ts,
 * code-lines.ts), also as the page changes, which one observer follows while
 * the mode is on. The choice is remembered per browser; without one, the
 * system setting `prefers-contrast: more` decides.
 */
export const CONTRAST_ATTRIBUTE = 'data-pm-contrast'
const STORAGE_KEY = 'presmium.publish.contrast'

const enabled = ref(false)
let initialized = false
let observer: MutationObserver | undefined

function stored(): boolean | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'high' ? true : value === 'normal' ? false : undefined
  } catch {
    return undefined
  }
}

/** While the mode is on, new shadow roots get the diagrams' sheet and lines that steps dim are marked. */
function follow(on: boolean): void {
  observer?.disconnect()
  observer = undefined
  if (!on || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        markDimmed(record.target)
        continue
      }
      for (const node of record.addedNodes) {
        // A shadow root is attached when its host mounts, before this observer runs.
        adoptShadows(node)
        markDimmed(node)
      }
    }
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
}

function apply(on: boolean): void {
  enabled.value = on
  if (on) document.documentElement.setAttribute(CONTRAST_ATTRIBUTE, 'high')
  else document.documentElement.removeAttribute(CONTRAST_ATTRIBUTE)
  styleDiagrams(on)
  raiseDimmedLines(on)
  follow(on)
}

/** Applies the remembered or system preference once; later calls do nothing. */
export function initHighContrast(): void {
  if (initialized || typeof document === 'undefined') return
  initialized = true
  apply(stored() ?? window.matchMedia?.('(prefers-contrast: more)').matches ?? false)
}

export interface HighContrast {
  enabled: Readonly<Ref<boolean>>
  set(on: boolean): void
  toggle(): void
}

export function useHighContrast(): HighContrast {
  initHighContrast()
  const set = (on: boolean) => {
    apply(on)
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'high' : 'normal')
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this page only.
    }
  }
  return { enabled: readonly(enabled), set, toggle: () => set(!enabled.value) }
}
