import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { APPROVAL_KINDS, DOCUMENT_ENTRY, errorMessage, LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { buildSummary, buildToDist, Compiler, findPackageDir, resolveEntry, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import type { McpHost } from './host.ts'
import { serveMcpStdio } from './mcp.ts'

const OWN_DIR = fileURLToPath(new URL('..', import.meta.url))
const CLI_PACKAGE = '@lincyaw/cli'

const USAGE = `Usage: presmium-mcp [deck] [--allow <kinds>]

Serves the document (a directory holding ${DOCUMENT_ENTRY}, or that JSON entry; default: .)
as MCP tools and resources on stdio, for the agent of an editor.

  --allow <kinds>  offer and allow these operations: operate (run_code, build), spend
  -h, --help       show this help`

async function stamps(files: string[]): Promise<string> {
  const times = await Promise.all(files.map(file => stat(file).then(s => s.mtimeMs, () => -1)))
  return times.join(',')
}

export function compilerMcpHost(entry: string, allow: readonly ApprovalKind[]): McpHost {
  const bundled = findPackageDir(CLI_PACKAGE, dirname(entry)) ?? findPackageDir(CLI_PACKAGE, OWN_DIR) ?? OWN_DIR
  const compiler = new Compiler(entry, { bundled })
  let latest: { compilation: Compilation, files: string[], stamp: string } | undefined
  let queue = Promise.resolve()
  const current = () => {
    const next = queue.then(async () => {
      if (latest && await stamps(latest.files) === latest.stamp) return latest.compilation
      const compilation = await compiler.compile()
      const files = [...compilation.sourceFiles, ...compilation.inputs.files]
      latest = { compilation, files, stamp: await stamps(files) }
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
      process.stdout.write(`${USAGE}\n`)
      return 0
    }
    if (positionals.length > 1) throw new Error(`unexpected argument "${positionals[1]}"`)
    deck = resolveEntry(positionals[0] ?? '.')
    allow = (values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []) as ApprovalKind[]
    const unknown = allow.find(kind => !APPROVAL_KINDS.includes(kind))
    if (unknown) throw new Error(`--allow takes ${APPROVAL_KINDS.join(', ')}, not "${unknown}"`)
    await stat(deck).catch(() => {
      throw new Error(`${deck} not found`)
    })
  } catch (error) {
    process.stderr.write(`presmium-mcp: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
  serveMcpStdio(compilerMcpHost(deck, allow), { member: LOCAL_AUTHOR, mode: 'author', document: '' })
  return undefined
}
