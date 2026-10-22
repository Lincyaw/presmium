import { componentCode, docBlocks, PROCESS_SANDBOX } from '@lincyaw/kernel'
import type { DirectiveSpec, IRPass, ProcessSandbox } from '@lincyaw/kernel'
import { minimalRunEnv } from '@lincyaw/kernel/node'
import { configuredTimeout, EXEC_ID, execConfig, isPython, stringArgs } from '../domain/index.ts'
import { codeComponent } from './code-component.ts'
import { pythonExecutor } from './python.ts'

export const stepRunDirective: DirectiveSpec = {
  name: 'step-run',
  arg: true,
  body: true,
  options: { steps: 'number', params: 'string', timeout: 'number' },
  toIR(input, ctx) {
    const node = codeComponent('PmStepRun', input, ctx)
    const steps = Number(input.options.steps)
    if (!Number.isInteger(steps) || steps < 1) {
      ctx.report({ checkId: 'presmium.exec.syntax', severity: 'warning', message: '{step-run} needs :steps:, the number of lines the code executes; without it the slide has no steps' })
      return { node }
    }
    node.props.steps = steps
    return { node, span: steps }
  },
}

const traced = new Map<string, Promise<number | undefined>>()

function traceLength(code: string, args: Record<string, string>, maxEvents: number, timeoutMs: number, sandbox: ProcessSandbox | undefined): Promise<number | undefined> {
  const key = JSON.stringify([code, args, maxEvents])
  let found = traced.get(key)
  if (!found) {
    const program = `import __main__\nprint(__main__._pm_trace(${JSON.stringify(code)}, ${JSON.stringify(JSON.stringify(args))}, '', '{}', ${maxEvents}))\n`
    found = pythonExecutor.run({ lang: 'python', code: program, timeoutMs }, undefined, { env: minimalRunEnv(), ...sandbox ? { sandbox } : {} }).then((result) => {
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

/** Warns when a step run declares another number of steps than the lines its code executes. */
export const stepCountPass: IRPass = {
  name: 'presmium.exec.steps',
  async run(doc, ctx) {
    if (!pythonExecutor.supports('python')) return
    const { maxTraceEvents } = execConfig(ctx.config)
    const sandbox = ctx.service?.(PROCESS_SANDBOX)
    for (const { section, block } of docBlocks(doc)) {
      const { node } = block
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmStepRun' || typeof node.props.steps !== 'number') continue
      const code = componentCode(node)
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
