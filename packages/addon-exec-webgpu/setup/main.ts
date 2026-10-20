import { registerPresmiumPlugin } from '@lincyaw/host'
import { defineAppSetup } from '@slidev/types'
import { execWebgpuPlugin } from '../src/client/index.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(execWebgpuPlugin)
})
