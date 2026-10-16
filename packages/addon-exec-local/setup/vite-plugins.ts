import { defineVitePluginsSetup } from '@slidev/types'
import { deckExecLocalConfig } from '../src/domain/index.ts'
import { deckDirOf, localEnvServer } from '../src/node/server.ts'

// The slides form's thin adapter of the dev-server endpoints, which the web form gets from the
// plugin's `vitePlugins` (src/node/presmium.ts): Slidev builds the generated deck's Vite config
// itself and registers an addon's Vite plugins from here. The local environment only exists
// while presenting from the dev server. The workspace in the configuration is relative to the
// Presmium deck, which holds the generated Slidev deck in its .presmium directory.
export default defineVitePluginsSetup((options) => {
  if (options.mode !== 'dev') return []
  const { workspace, buildTimeoutMs } = deckExecLocalConfig(options.data.headmatter, options.data.slides.map(slide => slide.frontmatter))
  return [localEnvServer({ deckDir: deckDirOf(options.userRoot), workspace, buildTimeoutMs })]
})
