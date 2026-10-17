import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_JUPYTER_ID } from '../domain/index.ts'
import { terminalDirective, terminalPass } from './directive.ts'
import { jupyterProvider } from './environments.ts'
import { jupyterServer } from './server.ts'
import { prebundled, servicesInBrowserBuilds } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Remote environments (P-105, P-107): the provider of `kind: jupyter`
 * environments (compile-time executors on a Jupyter Server's kernels,
 * `presmium check --env`), the server's proxy of `auth: proxy`
 * environments, and `{terminal}`. The browser side registers the same
 * environments' executors (src/client/plugin.ts) and draws the terminal
 * (components/PmTerminal.vue); the Vite plugins of both forms
 * (`vitePlugins`, ./vite.ts) keep the Jupyter client to its browser shim
 * and pre-bundle it.
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_JUPYTER_ID,
  version,
  kernel: '^0.1.0',
  directives: [terminalDirective],
  passes: [terminalPass],
  environments: { jupyter: jupyterProvider },
  server: jupyterServer,
  vitePlugins: () => [servicesInBrowserBuilds(), prebundled()],
  rendererExtensions: {
    // A terminal has no place in a notebook (docs/ir.md 5.1).
    notebook: { components: { PmTerminal: () => [] } },
  },
}

export default plugin
