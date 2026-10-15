import { registerPresmiumPlugin, startPresmium, SYNC_TRANSPORTS } from '@presmium/host'
import { PRESENTER_PANELS } from '@presmium/kernel'
import { configs, useNav } from '@slidev/client'
import { createPresenterPanels, presmiumConfig, wantsDemo } from '../domain/index.ts'
import { demoPlugins } from './demo.ts'
import StartReportPanel from './StartReportPanel.vue'
import { createSyncTransports } from './sync.ts'

/**
 * Starts the kernel in the slides form. Runs from `setup/root.ts`, i.e. after
 * every addon's `setup/main.ts` has registered its plugins.
 */
export function startSlidevPresmium(): void {
  const { slides } = useNav()
  const frontmatters = slides.value.map(route => (route.meta.slide as { frontmatter?: unknown }).frontmatter)
  if (wantsDemo([configs, ...frontmatters])) {
    demoPlugins.forEach(registerPresmiumPlugin)
  }
  const panels = createPresenterPanels()
  panels.register({ id: 'presmium.core.start-report', title: '启动报告', component: StartReportPanel, order: -1 })
  void startPresmium({
    mode: 'slides',
    config: presmiumConfig(configs),
    beforeStart(kernel) {
      kernel.provide(PRESENTER_PANELS, panels)
      kernel.provide(SYNC_TRANSPORTS, createSyncTransports())
    },
  })
}
