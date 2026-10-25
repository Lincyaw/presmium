import { createStore } from '@lincyaw/host'
import { ASK_STORAGE_KEY, toAskSettings } from '../domain/index.ts'
import type { AskSettings } from '../domain/index.ts'

function storedSettings(): AskSettings | undefined {
  try {
    return toAskSettings(JSON.parse(localStorage.getItem(ASK_STORAGE_KEY) ?? 'null'))
  } catch {
    return undefined
  }
}

export const askSettings = createStore<AskSettings | undefined>(typeof window === 'undefined' ? undefined : storedSettings())

export function saveAskSettings(settings: AskSettings | undefined): void {
  askSettings.set(settings)
  try {
    if (settings) localStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(settings))
    else localStorage.removeItem(ASK_STORAGE_KEY)
  } catch {
  }
}
