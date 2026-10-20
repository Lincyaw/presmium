import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { assistantPlugin } from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(assistantPlugin)
})
