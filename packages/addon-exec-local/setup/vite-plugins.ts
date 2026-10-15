import { defineVitePluginsSetup } from '@slidev/types'
import { deckExecLocalConfig } from '../src/domain/index.ts'
import { localEnvServer } from '../src/node/server.ts'

// The local environment only exists while presenting from the dev server.
export default defineVitePluginsSetup((options) => {
  if (options.mode !== 'dev') return []
  const { workspace } = deckExecLocalConfig(options.data.headmatter, options.data.slides.map(slide => slide.frontmatter))
  return [localEnvServer({ deckDir: options.userRoot, workspace })]
})
