import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { publishPlugin } from '../src/client/plugin.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(publishPlugin)
})
