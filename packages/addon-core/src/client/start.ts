import { createPresenterPanels, createToolbar, NAVIGATION, pluginsOf, registerPresmiumPlugin, startPresmium, SYNC_TRANSPORTS, TOOLBAR } from '@presmium/host'
import { PRESENTER_PANELS } from '@presmium/kernel'
import { configs } from '@slidev/client'
import { presmiumConfig } from '../domain/index.ts'
import { createSlidevNavigation } from './navigation.ts'
import * as clientPlugin from './plugin.ts'
import { createSyncTransports } from './sync.ts'

/**
 * Starts the kernel in the slides form. Runs from `setup/root.ts`, i.e. after
 * every addon's `setup/main.ts` has registered its plugins, in the root
 * component's setup (where the navigation service reads Slidev's navigation).
 */
export function startSlidevPresmium(): void {
  const config = presmiumConfig(configs)
  const navigation = createSlidevNavigation()
  pluginsOf(clientPlugin, config).forEach(registerPresmiumPlugin)
  void startPresmium({
    mode: 'slides',
    config,
    beforeStart(kernel) {
      kernel.provide(PRESENTER_PANELS, createPresenterPanels())
      kernel.provide(SYNC_TRANSPORTS, createSyncTransports())
      kernel.provide(NAVIGATION, navigation)
      kernel.provide(TOOLBAR, createToolbar())
    },
  })
}
