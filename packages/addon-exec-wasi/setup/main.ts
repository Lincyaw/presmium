import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { execWasiPlugin } from '../src/client/index.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(execWasiPlugin)
})
