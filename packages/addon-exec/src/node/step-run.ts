import { componentCode, docBlocks, PROCESS_SANDBOX } from '@lincyaw/kernel'
import type { IRPass, ProcessSandbox } from '@lincyaw/kernel'
import { directSandbox, minimalRunEnv } from '@lincyaw/kernel/node'
import { configuredTimeout, EXEC_ID, execConfig, isPython, stringArgs } from '../domain/index.ts'
import { pythonExecutor } from './python.ts'

const TRACE_CACHE_SIZE = 128
const traces = new WeakMap<ProcessSandbox, Map<string, Promise<number | undefined>>>()

async function traceLength(deckDir: string, code: string, args: Record<string, string>, maxEvents: number, timeoutMs: number, sandbox: ProcessSandbox): Promise<number | undefined> {
  let cache = traces.get(sandbox)
  if (!cache) traces.set(sandbox, cache = new Map())
  const key = JSON.stringify([deckDir, code, args, maxEvents, timeoutMs])
  let found = cache.get(key)
  if (!found) {
    const program = `import __main__\nprint(__main__._pm_trace(${JSON.stringify(code)}, ${JSON.stringify(JSON.stringify(args))}, '', '{}', ${maxEvents}))\n`
    found = pythonExecutor.run({ lang: 'python', code: program, timeoutMs }, undefined, { env: minimalRunEnv(), sandbox }).then((result) => {
      if (!result.ok) return undefined
      try {
        const trace = JSON.parse(result.stdout) as { events: unknown[], truncated: boolean }
        return trace.truncated ? undefined : trace.events.length
      } catch {
        return undefined
      }
    })
    cache.set(key, found)
    while (cache.size > TRACE_CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  let length: number | undefined
  try { return length = await found }
  finally { if (length === undefined && cache.get(key) === found) cache.delete(key) }
}

/** Warns when a step run declares another number of steps than the lines its code executes. */
export const stepCountPass: IRPass = {
  name: 'presmium.exec.steps',
  order: 20,
  async run(doc, ctx) {
    if (!pythonExecutor.supports('python')) return
    const { maxTraceEvents } = execConfig(ctx.config)
    const sandbox = ctx.service?.(PROCESS_SANDBOX) ?? directSandbox
    for (const { section, block } of docBlocks(doc)) {
      const { node } = block
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmStepRun' || typeof node.props.steps !== 'number') continue
      const code = componentCode(node)
      if (!code || !isPython(code.lang)) continue
      const timeoutMs = (typeof node.props.timeout === 'number' ? node.props.timeout : undefined) ?? configuredTimeout(ctx.configFor(section)) ?? execConfig(ctx.config).timeoutMs
      const lines = await traceLength(ctx.deckDir, code.value, stringArgs(node.props.params as Record<string, unknown> | undefined), maxTraceEvents, timeoutMs, sandbox)
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
