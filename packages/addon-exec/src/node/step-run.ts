import { docBlocks, PROCESS_SANDBOX } from '@lincyaw/kernel'
import type { Check, CodeNode, Finding, IRBlock, IRPass, ProcessSandbox } from '@lincyaw/kernel'
import { configuredTimeout, EXEC_ID, execConfig, inBrowserPython, isPython, pythonImports, stringArgs } from '../domain/index.ts'
import { plainEnv } from './child.ts'
import { ownCode } from './passes.ts'
import { pythonExecutor } from './python.ts'

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

const traced = new Map<string, Promise<number | undefined>>()

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
    if (!pythonExecutor.supports('python')) return
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
