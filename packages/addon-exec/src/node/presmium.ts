import { createRequire } from 'node:module'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_ID } from '../domain/index.ts'
import { runPanelDirective, stepRunDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { fallbackPass, panelPass, timeoutPass } from './passes.ts'
import { pythonExecutor } from './python.ts'
import { scriptExecutor } from './script.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * Execution (P-20, P-21, P-23, P-24, K-19, P-101, P-102): the `{run-panel}`
 * and `{step-run}` directives, the timeouts of `presmium.exec.timeoutMs`, the
 * run panels' environments and sessions, the local Python and JavaScript
 * executors for compile-time execution (sessions, rich outputs, the process
 * sandbox), the run panels' fallbacks with their compile-time output, and how
 * the notebook renders the components.
 * Live runs happen in the browser (Pyodide and a script worker, src/client).
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  version,
  kernel: '^0.1.0',
  directives: [runPanelDirective, stepRunDirective],
  passes: [timeoutPass, panelPass, fallbackPass],
  executors: [pythonExecutor, scriptExecutor],
  rendererExtensions,
}

export default plugin
