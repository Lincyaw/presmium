import { createStore, useStore } from '@lincyaw/host'
import { markDimmed, raiseDimmedLines } from './code-lines.ts'
import { adoptShadows, styleDiagrams } from './diagrams.ts'

export const CONTRAST_ATTRIBUTE = 'data-pm-contrast'
const STORAGE_KEY = 'presmium.publish.contrast'

const enabled = createStore(false)
let initialized = false
let observer: MutationObserver | undefined

function savedPreference(): boolean | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'high' ? true : value === 'normal' ? false : undefined
  } catch {
    return undefined
  }
}

function observeChanges(on: boolean): void {
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
        adoptShadows(node)
        markDimmed(node)
      }
    }
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
}

function apply(on: boolean): void {
  enabled.set(on)
  if (on) document.documentElement.setAttribute(CONTRAST_ATTRIBUTE, 'high')
  else document.documentElement.removeAttribute(CONTRAST_ATTRIBUTE)
  styleDiagrams(on)
  raiseDimmedLines(on)
  observeChanges(on)
}

export function initHighContrast(): void {
  if (initialized || typeof document === 'undefined') return
  initialized = true
  apply(savedPreference() ?? window.matchMedia?.('(prefers-contrast: more)').matches ?? false)
}

export interface HighContrast {
  enabled: boolean
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
    }
  }
  return { enabled: useStore(enabled), set, toggle: () => set(!enabled.getSnapshot()) }
}
