import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_ID } from '../domain/index.ts'
import { browserImportsCheck, stepsPass } from './checks.ts'
import { runPanelDirective, stepRunDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { fallbackPass, panelPass, timeoutPass } from './passes.ts'
import { pythonExecutor } from './python.ts'
import { scriptExecutor } from './script.ts'
import { prebundled, pyodideRuntime } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  version,
  kernel: '^1.0.0',
  directives: [runPanelDirective, stepRunDirective],
  passes: [timeoutPass, panelPass, stepsPass, fallbackPass],
  checks: [browserImportsCheck],
  executors: [pythonExecutor, scriptExecutor],
  rendererExtensions,
  vitePlugins: () => [pyodideRuntime(), prebundled()],
}

export default plugin
