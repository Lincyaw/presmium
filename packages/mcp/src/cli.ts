import { realpathSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { APPROVAL_KINDS, errorMessage, LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { devStateFile, fileVersion, readServiceState, serveStateDir } from '@lincyaw/kernel/node'
import { buildSummary, buildToDist, Compiler, findPackageDir, resolveEntry, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { bridgeStdio } from './bridge.ts'
import type { BridgeTarget } from './bridge.ts'
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

/** `installation`: the package whose dependencies hold the renderers and plugins (the presmium command's own). */
export function compilerMcpHost(entry: string, allow: readonly ApprovalKind[], installation?: string): McpHost {
  const bundled = installation ?? findPackageDir(CLI_PACKAGE, dirname(entry)) ?? findPackageDir(CLI_PACKAGE, OWN_DIR) ?? OWN_DIR
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
      if (!await stat(entry).then(info => info.isFile(), () => false)) return []
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
      if (!await stat(entry).then(info => info.isFile(), () => false)) return { tools: [], service: () => undefined }
      const compilation = await current()
      return { tools: compilation.plugins.flatMap(loaded => loaded.plugin?.tools ?? []), service: compilation.service }
    },
  }
}

export async function main(argv: string[], options: { bundled?: string } = {}): Promise<number | undefined> {
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
    const exists = await stat(deck).then(info => info.isFile(), () => false)
    if (!exists && !await stat(positionals[0] ?? '.').then(info => info.isDirectory(), () => false)) throw new Error(t.notFound(deck))
  } catch (error) {
    process.stderr.write(`presmium mcp: ${errorMessage(error)}\n\n${t.usage}\n`)
    return 2
  }
  const dir = deck.endsWith('.json') ? dirname(deck) : deck
  const running = runningService(dir)
  if (running) {
    process.stderr.write(`${t.bridging(running.mcp)}\n`)
    await bridgeStdio(running, { locate: () => runningService(dir), unreachable: t.unreachable, log: message => process.stderr.write(`presmium mcp: ${message}\n`) })
    return 0
  }
  serveMcpStdio(compilerMcpHost(deck, allow, options.bundled), { member: LOCAL_AUTHOR, mode: 'author', document: '' })
  return undefined
}

/**
 * The Presmium server running for `dir`: the workspace service of `dir` or of a directory above it (`presmium serve`,
 * or the one `presmium studio` starts), which edits documents; else the `presmium dev` of the document in `dir`.
 */
export function runningService(dir: string, env: NodeJS.ProcessEnv = process.env): BridgeTarget | undefined {
  let at: string
  try {
    at = realpathSync(resolve(dir))
  } catch {
    return undefined
  }
  for (let next = at; ; at = next) {
    const state = readServiceState(join(serveStateDir(at, env), 'server.json'))
    if (state) return { mcp: state.mcp, token: state.token }
    next = dirname(at)
    if (next === at) break
  }
  const dev = readServiceState(devStateFile(realpathSync(resolve(dir))))
  return dev ? { mcp: dev.mcp, token: dev.token } : undefined
}
