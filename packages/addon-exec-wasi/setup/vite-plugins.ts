import { isRecord } from '@presmium/kernel'
import { defineVitePluginsSetup } from '@slidev/types'
import { EXEC_WASI_ID, execWasiConfig } from '../src/domain/index.ts'
import { wasiRuntime } from '../src/node/vite.ts'

// The slides form's thin adapter of the runtime files, which the web form gets from the plugin's
// `vitePlugins` (src/node/presmium.ts): Slidev builds the generated deck's Vite config itself and
// registers an addon's Vite plugins from here. The runtimes the deck's live code needs are in the
// plugin's configuration, which the slides renderer writes to the headmatter's `presmium`.
export default defineVitePluginsSetup((options) => {
  const presmium = options.data.headmatter.presmium
  return [wasiRuntime(execWasiConfig(isRecord(presmium) ? presmium[EXEC_WASI_ID] : undefined).runtimes)]
})
