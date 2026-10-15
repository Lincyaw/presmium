import { createPresenterPanels, createToolbar, NAVIGATION, pluginsOf, registerPresmiumPlugin, startPresmium, stopPresmium, stopPresmiumOnPageHide, SYNC_TRANSPORTS, TOOLBAR } from '@presmium/host'
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
 * The plugins are disposed when the page goes away or this module is hot
 * updated.
 */
export function startSlidevPresmium(): void {
  const config = presmiumConfig(configs)
  const navigation = createSlidevNavigation()
  const transports = createSyncTransports()
  pluginsOf(clientPlugin, config).forEach(registerPresmiumPlugin)
  const start = () => void startPresmium({
    mode: 'slides',
    config,
    beforeStart(kernel) {
      kernel.provide(PRESENTER_PANELS, createPresenterPanels())
      kernel.provide(SYNC_TRANSPORTS, transports)
      kernel.provide(NAVIGATION, navigation)
      kernel.provide(TOOLBAR, createToolbar())
    },
  })
  start()
  stopPresmiumOnPageHide(start)
}

import.meta.hot?.dispose(() => stopPresmium())
