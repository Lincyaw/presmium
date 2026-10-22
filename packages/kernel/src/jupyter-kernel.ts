import { isRecord } from './errors.ts'
import { languageId } from './execution.ts'

/** The language of the notebook's Jupyter kernel, as `renderers.notebook.kernel` names it (a kernel name or `{ name, language }`); default Python. */
export function jupyterKernelLanguage(kernel: unknown): string {
  if (typeof kernel === 'string' && kernel) return languageId(kernel.replace(/[-\d.]+$/, '') || kernel)
  if (isRecord(kernel) && typeof kernel.language === 'string') return languageId(kernel.language)
  return 'python'
}
