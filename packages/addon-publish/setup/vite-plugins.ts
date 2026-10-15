import { defineVitePluginsSetup } from '@slidev/types'
import { offlinePlugins } from '../src/node/offline.ts'

// Offline support for `slidev build` (P-51); dev and export are left alone.
export default defineVitePluginsSetup(options => offlinePlugins(options.data.config, options.mode))
