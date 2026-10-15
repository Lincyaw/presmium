import type { PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_ID } from '../domain/index.ts'
import { runPanelDirective, stepRunDirective } from './directives.ts'
import { rendererExtensions } from './extensions.ts'
import { pythonExecutor } from './python.ts'

/**
 * Execution (P-20, P-21, P-23, P-24, K-19): the `{run-panel}` and `{step-run}`
 * directives, the local Python executor for compile-time execution, and how
 * the slides and the notebook render the components. Live runs happen in the
 * browser (Pyodide, src/client).
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_ID,
  directives: [runPanelDirective, stepRunDirective],
  executors: [pythonExecutor],
  rendererExtensions,
}

export default plugin
