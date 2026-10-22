import { componentCode, docBlocks } from '@lincyaw/kernel'
import type { Check, CodeNode, Finding, IRBlock } from '@lincyaw/kernel'
import { EXEC_ID, importableInBrowser, isPython, pythonImports } from '../domain/index.ts'

function browserPython(block: IRBlock): CodeNode | undefined {
  const { node } = block
  if (node.type === 'code') {
    const run = node.run
    return run && run.when !== 'compile' && !run.executor && isPython(run.lang) ? node : undefined
  }
  if (node.type === 'component' && node.plugin === EXEC_ID && node.name === 'PmStepRun' && isPython(String(node.props.lang ?? 'python'))) return componentCode(node)
  return undefined
}

/** Warns of Python that also runs in the browser and imports modules Pyodide does not have. */
export const browserImportsCheck: Check = {
  id: 'presmium.exec',
  async run(ctx) {
    const findings: Finding[] = []
    for (const { block } of docBlocks(ctx.ir)) {
      const code = browserPython(block)
      const missing = code ? pythonImports(code.value).filter(name => !importableInBrowser(name)) : []
      if (missing.length === 0) continue
      findings.push({
        checkId: 'presmium.exec',
        severity: 'warning',
        message: `this Python code also runs in the browser, which has the standard library only: ${missing.join(', ')} cannot be imported there`,
        hint: 'run it at compile time only (:run: compile), or write it with the standard library',
        source: { file: block.source.file, line: block.source.line },
      })
    }
    return findings
  },
}
