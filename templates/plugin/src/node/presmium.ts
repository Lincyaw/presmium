/**
 * The plugin in Node: what the compiler loads (`./presmium` in package.json).
 *
 *   :::{greeting} reader      becomes the component GreetingCard, which the web page and the
 *   :::                       slides show; the notebook shows its fallback, a paragraph
 *
 * Under `presmium dev` and `presmium serve`, its route `/__presmium/<id>/waves` counts the waves
 * at the document (GET reads, POST waves once more). A built site has no server.
 */
import { createRequire } from 'node:module'
import { deckLocale, json } from '@lincyaw/kernel'
import type { DirectiveSpec, PresmiumNodePlugin } from '@lincyaw/kernel'
import { COMPONENT, GREETING_MESSAGES, PLUGIN_ID } from '../domain/index.ts'
import type { Waves } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const greeting: DirectiveSpec = {
  name: 'greeting',
  arg: true,
  toIR(input, ctx) {
    // Text written into the output follows the document's language.
    const t = GREETING_MESSAGES[deckLocale(ctx.lang)]
    let name = input.arg?.trim()
    if (!name) {
      ctx.report({ checkId: PLUGIN_ID, severity: 'warning', message: '{greeting} names no one to greet, e.g. {greeting} reader' })
      name = t.everyone
    }
    return {
      node: {
        type: 'component',
        plugin: PLUGIN_ID,
        name: COMPONENT,
        props: { name },
        // What renderers that cannot run the component show (the notebook, a PDF export): mdast.
        fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: t.greeting(name) }] }] },
      },
    }
  },
}

const plugin: PresmiumNodePlugin = {
  id: PLUGIN_ID,
  version,
  // The plugin contract this plugin is written for (KERNEL_VERSION of @lincyaw/kernel); the
  // compiler does not load a plugin whose range excludes the installed one.
  kernel: '^1.0.0',
  directives: [greeting],
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
            return json({ waves } satisfies Waves)
          },
        },
      },
    }
  },
}

export default plugin
