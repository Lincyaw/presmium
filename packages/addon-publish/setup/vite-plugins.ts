import { defineVitePluginsSetup } from '@slidev/types'
import { offlinePlugins } from '../src/node/offline.ts'
import { printPage } from './print.ts'

// Offline support for `slidev build` (P-51); the print page of `slidev export` says when it is ready (./print.ts).
export default defineVitePluginsSetup(options => [
  ...offlinePlugins(options.data.config, options.mode),
  ...(options.mode === 'export' ? [printPage()] : []),
])
