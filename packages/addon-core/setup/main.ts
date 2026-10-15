import { installHost } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import { createSlidevHost } from '../src/client/host.ts'

// Plugins register in their addons' setup/main.ts; the kernel starts in setup/root.ts.
export default defineAppSetup(({ app }) => {
  installHost(app, createSlidevHost())
})
