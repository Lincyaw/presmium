import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { EXEC_JUPYTER_ID } from '../domain/index.ts'
import { declaredEnvironmentsPass } from './declared.ts'
import { terminalDirective, terminalPass } from './directive.ts'
import { jupyterProvider } from './environments.ts'
import { jupyterServer } from './server.ts'
import { prebundled, servicesInBrowserBuilds } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: EXEC_JUPYTER_ID,
  version,
  kernel: '^1.0.0',
  directives: [terminalDirective],
  passes: [declaredEnvironmentsPass, terminalPass],
  environments: { jupyter: jupyterProvider },
  server: jupyterServer,
  vitePlugins: () => [servicesInBrowserBuilds(), prebundled()],
  rendererExtensions: {
    notebook: { components: { PmTerminal: () => [] } },
  },
}

export default plugin
