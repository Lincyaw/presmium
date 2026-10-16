import { useSharedState } from '@presmium/host'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { SCREEN_KEY, screenMode, toggleScreen } from '../domain/index.ts'
import type { ScreenMode } from '../domain/index.ts'

/** The state where no host is installed (a slides deck without @presmium/slidev-addon-core): this window's own. */
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

/**
 * The audience screen (P-03), the same in both forms: a shared state of the
 * host (`useSharedState`, scope 'remote'), so every window of the deck
 * follows it (the audience and the presenter window) and so do the other
 * devices of a classroom (the sync transports). Callable once the host is
 * installed, in a component or not.
 */
export function useScreen(): { mode: Readonly<Ref<ScreenMode>>, toggle(wanted: Exclude<ScreenMode, 'live'>): void } {
  const current = state()
  return {
    mode: computed(() => screenMode(current.value)),
    toggle(wanted) {
      current.value = toggleScreen(screenMode(current.value), wanted)
    },
  }
}
