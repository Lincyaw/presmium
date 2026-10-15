import { defineRootSetup } from '@slidev/types'
import { startSlidevPresmium } from '../src/client/start.ts'

// Root setups run after every app setup, so all plugins are registered by now.
export default defineRootSetup(() => {
  startSlidevPresmium()
})
