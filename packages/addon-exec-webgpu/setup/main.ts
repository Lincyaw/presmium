import { registerPresmiumPlugin } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import { execWebgpuPlugin } from '../src/client/index.ts'

// The kernel starts in addon-core's setup/root.ts, after every addon has registered.
export default defineAppSetup(() => {
  registerPresmiumPlugin(execWebgpuPlugin)
})
