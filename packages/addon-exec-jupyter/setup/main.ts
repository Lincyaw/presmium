import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { execJupyterPlugin } from '../src/client/index.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(execJupyterPlugin)
})
