import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_ID } from '../domain/index.ts'
import { runPanelDirective, stepRunDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { fallbackPass, timeoutPass } from './passes.ts'
import { pythonExecutor } from './python.ts'
import { scriptExecutor } from './script.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Execution (P-20, P-21, P-23, P-24, K-19): the `{run-panel}` and `{step-run}`
 * directives, the timeouts of `presmium.exec.timeoutMs`, the local Python and
 * JavaScript executors for compile-time execution, the run panels' fallbacks
 * with their compile-time output, and how the notebook renders the components.
 * Live runs happen in the browser (Pyodide and a script worker, src/client).
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  version,
  kernel: '^0.1.0',
  directives: [runPanelDirective, stepRunDirective],
  passes: [timeoutPass, fallbackPass],
  executors: [pythonExecutor, scriptExecutor],
  rendererExtensions,
}

export default plugin
