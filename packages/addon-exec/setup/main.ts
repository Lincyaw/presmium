import { registerPresmiumPlugin } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import { execPlugin } from '../src/client/index.ts'

export default defineAppSetup(() => {
  registerPresmiumPlugin(execPlugin)
})
