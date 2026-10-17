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

/**
 * Execution (P-20, P-21, P-23, P-24, K-19, P-101, P-102): the `{run-panel}`
 * and `{step-run}` directives, the timeouts of `presmium.exec.timeoutMs`, the
 * run panels' environments and sessions, the local Python and JavaScript
 * executors for compile-time execution (sessions, rich outputs, the process
 * sandbox), the run panels' fallbacks with their compile-time output, and how
 * the notebook renders the components; the Vite plugins of both forms
 * (`vitePlugins`: the Pyodide runtime with its licenses, ./vite.ts); and
 * what it reports to the author (./checks.ts): a stepwise run whose steps
 * are not the lines its code executes, Python for the browser that imports
 * what the browser lacks.
 * Live runs happen in the browser (Pyodide and a script worker, src/client).
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  version,
  kernel: '^0.1.0',
  directives: [runPanelDirective, stepRunDirective],
  passes: [timeoutPass, panelPass, stepsPass, fallbackPass],
  checks: [browserImportsCheck],
  executors: [pythonExecutor, scriptExecutor],
  rendererExtensions,
  vitePlugins: () => [pyodideRuntime(), prebundled()],
}

export default plugin
