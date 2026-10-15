import { createPresenterPanels, pluginsOf, registerPresmiumPlugin, startPresmium, SYNC_TRANSPORTS } from '@presmium/host'
import { PRESENTER_PANELS } from '@presmium/kernel'
import { configs } from '@slidev/client'
import { presmiumConfig } from '../domain/index.ts'
import * as clientPlugin from './plugin.ts'
import { createSyncTransports } from './sync.ts'

/**
 * Starts the kernel in the slides form. Runs from `setup/root.ts`, i.e. after
 * every addon's `setup/main.ts` has registered its plugins.
 */
export function startSlidevPresmium(): void {
  const config = presmiumConfig(configs)
  pluginsOf(clientPlugin, config).forEach(registerPresmiumPlugin)
  void startPresmium({
    mode: 'slides',
    config,
    beforeStart(kernel) {
      kernel.provide(PRESENTER_PANELS, createPresenterPanels())
      kernel.provide(SYNC_TRANSPORTS, createSyncTransports())
    },
  })
}
