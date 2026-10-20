import { useSharedState } from '@lincyaw/host'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { SCREEN_KEY, screenMode, toggleScreen } from '../domain/index.ts'
import type { ScreenMode } from '../domain/index.ts'

let alone: Ref<string> | undefined

function state(): Ref<string> {
  try {
    return useSharedState<string>(SCREEN_KEY, 'live', { scope: 'remote' })
  } catch (error) {
    if (!alone) console.warn('[presmium] the audience screen is not shared between windows without a host adapter', error)
    alone ??= ref('live')
    return alone
  }
}

export function useScreen(): { mode: Readonly<Ref<ScreenMode>>, toggle(wanted: Exclude<ScreenMode, 'live'>): void } {
  const current = state()
  return {
    mode: computed(() => screenMode(current.value)),
    toggle(wanted) {
      current.value = toggleScreen(screenMode(current.value), wanted)
    },
  }
}
