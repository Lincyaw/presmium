import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { APPROVAL_KINDS, errorMessage, LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { fileVersion } from '@lincyaw/kernel/node'
import { buildSummary, buildToDist, Compiler, findPackageDir, resolveEntry, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import type { McpHost } from './host.ts'
import { serveMcpStdio } from './mcp.ts'
import { MCP_CLI_MESSAGES, systemLocale } from './messages.ts'

const OWN_DIR = fileURLToPath(new URL('..', import.meta.url))
const CLI_PACKAGE = '@lincyaw/cli'

const t = MCP_CLI_MESSAGES[systemLocale()]

async function stamps(files: string[]): Promise<string> {
  const times = await Promise.all(files.map(file => stat(file, { bigint: true }).then(fileVersion, () => 'missing')))
  return times.join(',')
}

export function compilerMcpHost(entry: string, allow: readonly ApprovalKind[]): McpHost {
  const bundled = findPackageDir(CLI_PACKAGE, dirname(entry)) ?? findPackageDir(CLI_PACKAGE, OWN_DIR) ?? OWN_DIR
  const compiler = new Compiler(entry, { bundled })
  let inputs = [entry]
  let latest: { compilation: Compilation, files: string[], stamp: string } | undefined
  let queue = Promise.resolve()
  const current = () => {
    const next = queue.then(async () => {
      if (latest && await stamps(latest.files) === latest.stamp) return latest.compilation
      const before = await stamps(inputs)
      const compilation = await compiler.compile()
      const files = [...new Set([...compilation.sourceFiles, ...compilation.inputs.files])]
      const stamp = await stamps(files)
      const known = new Set(inputs)
      const stable = files.length === known.size && files.every(file => known.has(file)) && await stamps(inputs) === before
      inputs = files
      latest = stable ? { compilation, files, stamp } : undefined
      return compilation
    })
    queue = next.then(() => undefined, () => undefined)
    return next
  }
  const only = async (document: string) => {
    if (document !== '') throw new Error(`no document ${JSON.stringify(document)}: presmium-mcp serves one deck`)
    return current()
  }
  return {
    process: { command: 'presmium-mcp' },
    async documents() {
      const { doc } = await current()
      return [{ dir: '', title: doc.meta.title, lang: doc.meta.lang }]
    },
    async compile(document) {
      const { doc } = await only(document)
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = await only(document)
      return [...compilation.doc.diagnostics, ...await compilation.check()]
    },
    async build(document, options) {
      return buildSummary(await buildToDist(await only(document), { to: options.to }))
    },
    run: async (document, target, signal) => runBlock(await only(document), target, signal),
    approve: async request => allow.includes(request.kind),
    offers: kind => allow.includes(kind),
    async tools() {
      const compilation = await current()
      return { tools: compilation.plugins.flatMap(loaded => loaded.plugin?.tools ?? []), service: compilation.service }
    },
  }
}

export async function main(argv: string[]): Promise<number | undefined> {
  let deck: string
  let allow: ApprovalKind[]
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { allow: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
    if (values.help) {
      process.stdout.write(`${t.usage}\n`)
      return 0
    }
    if (positionals.length > 1) throw new Error(t.unexpectedArgument(positionals[1]!))
    deck = resolveEntry(positionals[0] ?? '.')
    allow = (values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []) as ApprovalKind[]
    const unknown = allow.find(kind => !APPROVAL_KINDS.includes(kind))
    if (unknown) throw new Error(t.badAllow(APPROVAL_KINDS, unknown))
    await stat(deck).catch(() => {
      throw new Error(t.notFound(deck))
    })
  } catch (error) {
    process.stderr.write(`presmium-mcp: ${errorMessage(error)}\n\n${t.usage}\n`)
    return 2
  }
  serveMcpStdio(compilerMcpHost(deck, allow), { member: LOCAL_AUTHOR, mode: 'author', document: '' })
  return undefined
}
