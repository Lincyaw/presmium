import { registerPresmiumPlugin } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import contentPlugin from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(contentPlugin)
})
