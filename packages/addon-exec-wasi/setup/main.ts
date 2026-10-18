import { registerPresmiumPlugin } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import plugin from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(plugin)
})
