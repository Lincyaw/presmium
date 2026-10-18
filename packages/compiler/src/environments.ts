import { environmentExecutor, errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { CodeNode, EnvironmentContext, EnvironmentProvider, EnvironmentSpec, ExecuteConfig, Executor, Finding, IRDocument } from '@presmium/kernel'

const PREFIX = environmentExecutor('')

type At = (needle: string) => { file: string, line: number }

export function readExecute(value: unknown, report: (finding: Finding) => void, at: At): ExecuteConfig {
  if (value === undefined) return {}
  const fail = (message: string, needle = 'execute') => report({ checkId: 'presmium.execute', severity: 'error', message, source: at(needle) })
  if (!isRecord(value)) {
    fail('`execute` must be a mapping, e.g. `execute: { environments: { box: { kind: devcontainer } } }`')
    return {}
  }
  const execute: ExecuteConfig = {}
  if (value.env !== undefined) {
    if (typeof value.env === 'string' && value.env.trim()) execute.env = value.env.trim()
    else fail('`execute.env` must be the name of an environment')
  }
  if (value.rerun === 'environment') execute.rerun = 'environment'
  if (value.environments !== undefined) {
    if (!isRecord(value.environments)) {
      fail('`execute.environments` must map names to environments, e.g. `box: { kind: devcontainer }`')
    } else {
      const environments: Record<string, EnvironmentSpec> = {}
      for (const [name, spec] of Object.entries(value.environments)) {
        if (name === 'browser' || !/^[\w-]+$/.test(name)) fail(`environment "${name}": a name is letters, digits, \`_\` and \`-\`, and not \`browser\`, which is reserved`, `${name}:`)
        else if (!isRecord(spec) || typeof spec.kind !== 'string' || !spec.kind) fail(`environment "${name}" needs a \`kind\`, e.g. jupyter, devcontainer, wasi, webgpu`, `${name}:`)
        else environments[name] = spec as EnvironmentSpec
      }
      execute.environments = environments
    }
  }
  if (execute.env && execute.env !== 'browser' && !execute.environments?.[execute.env]) fail(`\`execute.env\`: no environment "${execute.env}" in \`execute.environments\``)
  return execute
}

export function environmentProviders(execute: ExecuteConfig, providers: Map<string, EnvironmentProvider>, report: (finding: Finding) => void, at: At): Map<string, EnvironmentProvider> {
  const found = new Map<string, EnvironmentProvider>()
  for (const [name, spec] of Object.entries(execute.environments ?? {})) {
    const provider = providers.get(spec.kind)
    if (provider) found.set(name, provider)
    else report({ checkId: 'presmium.execute', severity: 'error', message: `environment "${name}": no plugin in \`plugins\` provides environments of kind ${spec.kind}`, source: at(`${name}:`) })
  }
  return found
}

export async function environmentExecutors(
  execute: ExecuteConfig,
  providers: Map<string, EnvironmentProvider>,
  context: EnvironmentContext,
  made: Map<string, Executor>,
  report: (finding: Finding) => void,
  at: At,
): Promise<Executor[]> {
  const executors: Executor[] = []
  for (const [name, provider] of providers) {
    const spec = execute.environments![name]!
    const key = JSON.stringify([name, spec])
    let executor = made.get(key)
    if (!executor) {
      try {
        executor = await provider.create(name, spec, context)
      } catch (error) {
        report({ checkId: 'presmium.execute', severity: 'error', message: `environment "${name}": the ${spec.kind} provider failed: ${errorMessage(error)}`, source: at(`${name}:`) })
        continue
      }
      if (executor.id !== environmentExecutor(name)) {
        report({ checkId: 'presmium.execute', severity: 'error', message: `environment "${name}": the ${spec.kind} provider made the executor ${executor.id}, not ${environmentExecutor(name)}`, source: at(`${name}:`) })
        continue
      }
      made.set(key, executor)
    }
    executors.push(executor)
  }
  return executors
}

export function checkRuns(doc: IRDocument, execute: ExecuteConfig, report: (finding: Finding) => void): void {
  const sessions = new Map<string, string>()
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      const run = block.node.type === 'code' ? block.node.run : undefined
      if (!run) continue
      const fail = (message: string) => report({ checkId: 'presmium.execute', severity: 'error', message, source: { file: block.source.file, line: block.source.line } })
      const name = run.executor?.startsWith(PREFIX) ? run.executor.slice(PREFIX.length) : undefined
      if (name !== undefined && !execute.environments?.[name]) fail(`:env: ${name}: no such environment in \`execute.environments\` of the headmatter`)
      if (!run.session) continue
      const where = run.executor ?? 'browser'
      const first = sessions.get(run.session)
      if (first === undefined) sessions.set(run.session, where)
      else if (first !== where) fail(`session "${run.session}" runs in ${describe(first)} and here in ${describe(where)}; the blocks of a session share one environment`)
    }
  }
}

export function checkLanguages(doc: IRDocument, execute: ExecuteConfig, executors: readonly Executor[], report: (finding: Finding) => void): Set<CodeNode> {
  const reported = new Set<CodeNode>()
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      const run = block.node.type === 'code' ? block.node.run : undefined
      const name = run?.executor?.startsWith(PREFIX) ? run.executor.slice(PREFIX.length) : undefined
      const spec = name === undefined ? undefined : execute.environments?.[name]
      const executor = spec?.languages?.length ? executors.find(e => e.id === run!.executor) : undefined
      if (!run || !spec?.languages || !executor || executor.supports(run.lang)) continue
      reported.add(block.node as CodeNode)
      const runs = `runs ${spec.languages.join(', ')}, not ${run.lang}`
      const fallback = execute.env === name ? ` (blocks that name none run in "${name}", the headmatter's execute.env)` : ''
      report({
        checkId: 'presmium.execute',
        severity: 'error',
        message: `environment "${name}" (${spec.kind}) ${runs}`,
        hint: `name another environment with :env:${fallback}, or add ${run.lang} to the languages of "${name}"`,
        source: { file: block.source.file, line: block.source.line },
      })
    }
  }
  return reported
}

function describe(executor: string): string {
  return executor.startsWith(PREFIX) ? `environment ${executor.slice(PREFIX.length)}` : executor === 'browser' ? 'the default environment' : `executor ${executor}`
}

const CREDENTIALS = [
  /^sk-[\w-]{16,}$/,
  /^(?:gh[pousr]|github_pat)_\w{20,}$/,
  /^xox[abposr]-[\w-]{10,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^AIza[\w-]{30,}$/,
  /^eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]
const CREDENTIAL_KEY = /(?:^|[_-])(?:token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key)$/i

export function checkSecrets(headmatter: Record<string, unknown>, report: (finding: Finding) => void, at: At): void {
  const visit = (value: unknown, key: string, path: string) => {
    if (typeof value === 'string') {
      const looks = CREDENTIALS.some(pattern => pattern.test(value.trim())) || (CREDENTIAL_KEY.test(key) && value.trim().length >= 12 && !/\s/.test(value.trim()))
      if (looks) report({ checkId: 'presmium.secrets', severity: 'warning', message: `${path} looks like a credential; credentials come from environment variables or a login (e.g. PRESMIUM_ENV_<NAME>_TOKEN), never from the deck, which is published`, source: at(`${key}:`) })
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, key, `${path}[${i}]`))
    } else if (isRecord(value)) {
      for (const [k, v] of Object.entries(value)) visit(v, k, path ? `${path}.${k}` : k)
    }
  }
  visit(headmatter, '', '')
}
