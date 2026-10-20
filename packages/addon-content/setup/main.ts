import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import contentPlugin from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(contentPlugin)
})
