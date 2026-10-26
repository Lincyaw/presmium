/**
 * The plugin in Node: what the compiler loads (`./presmium` in package.json).
 *
 * A lecture.json component definition names this plugin and GreetingCard. The component is
 * shared by the web page and slides; its definition supplies the static fallback.
 *
 * Under `presmium dev` and `presmium serve`, its route `/__presmium/<id>/waves` counts the waves
 * at the document (GET reads, POST waves once more). A built site has no server.
 */
import { createRequire } from 'node:module'
import { jsonResponse } from '@lincyaw/kernel'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { PLUGIN_ID } from '../domain/index.ts'
import type { Waves } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }


const plugin: PresmiumNodePlugin = {
  id: PLUGIN_ID,
  version,
  // The plugin contract this plugin is written for (KERNEL_VERSION of @lincyaw/kernel); the
  // compiler does not load a plugin whose range excludes the installed one.
  kernel: '^1.0.0',
  // The server part: once per document (`presmium dev` serves one, `presmium serve` each one
  // opened). Pages call the routes with `useServer().fetch(PLUGIN_ID, 'waves')`.
  server() {
    let waves = 0
    return {
      routes: {
        waves: {
          // Who may call it: readers too (the default is editors).
          role: 'reader',
          handle(request) {
            if (request.method === 'POST') waves++
            return jsonResponse({ waves } satisfies Waves)
          },
        },
      },
    }
  },
}

export default plugin
