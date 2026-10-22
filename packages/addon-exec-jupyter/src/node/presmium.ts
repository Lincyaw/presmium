import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { EXEC_JUPYTER_ID } from '../domain/index.ts'
import { declaredEnvironmentsPass } from './declared.ts'
import { jupyterProvider } from './provider.ts'
import { jupyterProxy } from './proxy.ts'
import { terminalDirective, terminalPass } from './terminal.ts'
import { jupyterPrebundle, jupyterWsShim } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: EXEC_JUPYTER_ID,
  version,
  kernel: '^1.0.0',
  directives: [terminalDirective],
  passes: [declaredEnvironmentsPass, terminalPass],
  environments: { jupyter: jupyterProvider },
  server: jupyterProxy,
  vitePlugins: () => [jupyterWsShim(), jupyterPrebundle()],
  rendererExtensions: {
    notebook: { components: { PmTerminal: () => [] } },
  },
}

export default plugin
