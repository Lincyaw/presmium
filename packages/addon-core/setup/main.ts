import { installHost } from '@presmium/host'
import { defineAppSetup } from '@slidev/types'
import { createSlidevHost } from '../src/client/host.ts'

// Plugins register in their addons' setup/main.ts; the kernel starts in setup/root.ts.
export default defineAppSetup(({ app }) => {
  const host = createSlidevHost()
  // Slidev applies the headmatter `htmlAttrs` once the app has mounted, after the plugins have
  // started; until then the page says `lang="en"`. Plugins read the UI language from `<html lang>`
  // as they start, so it carries the deck's language from the start.
  if (host.lang && typeof document !== 'undefined') document.documentElement.lang = host.lang
  installHost(app, host)
})
