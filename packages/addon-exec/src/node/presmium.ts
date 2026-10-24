import { createRequire } from 'node:module'
import { servedAssets } from '@lincyaw/kernel/node'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { EXEC_ID } from '../domain/index.ts'
import { browserImportsCheck } from './browser-imports.ts'
import { rendererExtensions } from './notebook-cells.ts'
import { pythonExecutor } from './python.ts'
import { runPanelDirective, runPanelFallbackPass, runPanelPass } from './run-panel.ts'
import { scriptExecutor } from './script.ts'
import { stepCountPass, stepRunDirective } from './step-run.ts'
import { timeoutPass } from './timeouts.ts'
import { execPrebundle, pyodideAssets } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  version,
  kernel: '^1.0.0',
  directives: [runPanelDirective, stepRunDirective],
  passes: [timeoutPass, runPanelPass, stepCountPass, runPanelFallbackPass],
  checks: [browserImportsCheck],
  executors: [pythonExecutor, scriptExecutor],
  rendererExtensions,
  assets: () => [pyodideAssets()],
  vitePlugins: () => [servedAssets(pyodideAssets()), execPrebundle()],
}

export default plugin
