/**
 * What the execution plugin reports about code that runs in the browser.
 *
 * - The check `presmium.exec` (`presmium check`, D-5): Python that also runs
 *   in the browser (`:run: live` or `both`, a run panel, a stepwise run) and
 *   imports a module the browser lacks: Pyodide there has the standard
 *   library only, so the reader's run would fail where the recording shows
 *   output. Code of a named environment (`:env:`) runs there, not here.
 * - The pass `presmium.exec.steps` (P-21): a stepwise run whose `:steps:` is
 *   not the number of lines its code executes, traced as the browser traces
 *   it (`_pm_trace` of the runner) by the machine's Python, reported at the
 *   directive in `presmium build` and `presmium check`. The slide shows the
 *   declared steps, so it is the author who must hear of it, not the
 *   audience (the component says so only in the presenter view and in dev).
 */
import { docBlocks, PROCESS_SANDBOX } from '@presmium/kernel'
import type { Check, CodeNode, Finding, IRBlock, IRPass, ProcessSandbox } from '@presmium/kernel'
import { configuredTimeout, EXEC_ID, execConfig, inBrowserPython, isPython, pythonImports, stringArgs } from '../domain/index.ts'
import { plainEnv } from './child.ts'
import { ownCode } from './passes.ts'
import { pythonExecutor } from './python.ts'

/** The Python code of a block that runs in the browser's Pyodide, if it is such a block. */
function browserPython(block: IRBlock): CodeNode | undefined {
  const { node } = block
  if (node.type === 'code') {
    const run = node.run
    return run && run.when !== 'compile' && !run.executor && isPython(run.lang) ? node : undefined
  }
  if (node.type === 'component' && node.plugin === EXEC_ID && node.name === 'PmStepRun' && isPython(String(node.props.lang ?? 'python'))) return ownCode(node)
  return undefined
}

export const browserImportsCheck: Check = {
  id: 'presmium.exec',
  async run(ctx) {
    const findings: Finding[] = []
    for (const { block } of docBlocks(ctx.ir)) {
      const code = browserPython(block)
      const missing = code ? pythonImports(code.value).filter(name => !inBrowserPython(name)) : []
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

/** The number of lines code executes, by code and arguments, traced once per process (dev compiles again and again). */
const traced = new Map<string, Promise<number | undefined>>()

/**
 * The lines Python code executes, traced by the runner's own tracer in the
 * machine's Python (the runner is the program's `__main__`), in the process
 * sandbox when there is one; undefined when it cannot be told (no Python,
 * a failure, more lines than the trace keeps).
 */
function traceLength(code: string, args: Record<string, string>, maxEvents: number, timeoutMs: number, sandbox: ProcessSandbox | undefined): Promise<number | undefined> {
  const key = JSON.stringify([code, args, maxEvents])
  let found = traced.get(key)
  if (!found) {
    const program = `import __main__\nprint(__main__._pm_trace(${JSON.stringify(code)}, ${JSON.stringify(JSON.stringify(args))}, '', '{}', ${maxEvents}))\n`
    found = pythonExecutor.run({ lang: 'python', code: program, timeoutMs }, undefined, { env: plainEnv(), ...sandbox ? { sandbox } : {} }).then((result) => {
      if (!result.ok) return undefined
      try {
        const trace = JSON.parse(result.stdout) as { events: unknown[], truncated: boolean }
        return trace.truncated ? undefined : trace.events.length
      } catch {
        return undefined
      }
    })
    traced.set(key, found)
  }
  return found
}

export const stepsPass: IRPass = {
  name: 'presmium.exec.steps',
  async run(doc, ctx) {
    // In SHARED mode the compiling process runs none of the deck's code.
    if (ctx.trust === 'shared' || !pythonExecutor.supports('python')) return
    const { maxTraceEvents } = execConfig(ctx.config)
    const sandbox = ctx.service?.(PROCESS_SANDBOX)
    for (const { section, block } of docBlocks(doc)) {
      const { node } = block
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmStepRun' || typeof node.props.steps !== 'number') continue
      const code = ownCode(node)
      if (!code || !isPython(code.lang)) continue
      const timeoutMs = (typeof node.props.timeout === 'number' ? node.props.timeout : undefined) ?? configuredTimeout(ctx.configFor(section)) ?? execConfig(ctx.config).timeoutMs
      const lines = await traceLength(code.value, stringArgs(node.props.params as Record<string, unknown> | undefined), maxTraceEvents, timeoutMs, sandbox)
      if (lines === undefined || lines === node.props.steps) continue
      ctx.report({
        checkId: 'presmium.exec',
        severity: 'warning',
        message: `{step-run} declares :steps: ${node.props.steps}, but its code executes ${lines} lines: the slide's steps do not match the lines`,
        hint: `write :steps: ${lines}`,
        source: { file: block.source.file, line: block.source.line },
      })
    }
  },
}
