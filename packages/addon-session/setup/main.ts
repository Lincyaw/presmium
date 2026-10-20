import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import sessionPlugin from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(sessionPlugin)
})
