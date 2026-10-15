import { addSyncMethod, createSyncState, mode, slidesTitle } from '@slidev/client'
import { toRaw } from 'vue'
import { toggleScreen } from '../src/domain/index.ts'
import type { ScreenMode } from '../src/domain/index.ts'

/**
 * The audience screen state (P-03), shared by every window of the deck. It is a
 * Slidev sync channel, so it travels wherever navigation does: Slidev's own
 * same-browser sync in builds, and any transport joined through `addSyncMethod`
 * (the `syncTransports` service) across devices.
 */
interface ScreenState {
  mode: ScreenMode
}

const CHANNEL = `${slidesTitle} - presmium-stage`

type SlidevSync = Parameters<typeof addSyncMethod>[0]

/**
 * In dev, Slidev syncs its own channels through the dev server, which other
 * channels cannot join; this joins the windows of one browser instead.
 */
const browserWindows: SlidevSync = {
  init(channel, onUpdate) {
    if (channel !== CHANNEL) return undefined
    const broadcast = new BroadcastChannel(`${CHANNEL} (dev)`)
    broadcast.onmessage = event => onUpdate(event.data)
    return (state, updating) => {
      if (!updating) broadcast.postMessage(toRaw(state))
    }
  },
}

const sync = createSyncState<ScreenState>({ mode: 'live' }, { mode: 'live' })
if (mode === 'dev') addSyncMethod(browserWindows)
sync.init(CHANNEL)

export const screen: Readonly<ScreenState> = sync.state

export function toggle(wanted: Exclude<ScreenMode, 'live'>): void {
  sync.patch('mode', toggleScreen(sync.state.mode, wanted))
}
