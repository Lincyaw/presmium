import { defineVitePluginsSetup } from '@slidev/types'
import { offlinePlugins } from '../src/node/offline.ts'
import { printPage } from './print.ts'

export default defineVitePluginsSetup(options => [
  ...offlinePlugins(options.data.config, options.mode),
  ...(options.mode === 'export' ? [printPage()] : []),
])
