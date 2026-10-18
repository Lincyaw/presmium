import { installHost } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import { createSlidevHost } from '../src/client/host.ts'

export default defineAppSetup(({ app }) => {
  const host = createSlidevHost()
  if (host.lang && typeof document !== 'undefined') document.documentElement.lang = host.lang
  installHost(app, host)
})
