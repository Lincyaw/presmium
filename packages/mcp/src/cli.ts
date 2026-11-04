import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { APPROVAL_KINDS, errorMessage, isRecord, LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { devStateFile, fileVersion, readServiceState, serveStateDir } from '@lincyaw/kernel/node'
import { buildSummary, buildToDist, Compiler, findPackageDir, resolveEntry, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { bridgeStdio } from './bridge.ts'
import type { BridgeTarget } from './bridge.ts'
import { connectPresmiumMcp } from './client.ts'
import type { PresmiumMcpClient } from './client.ts'
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
  if (argv[0] === 'call' || argv[0] === 'tools') return toolCommand(argv[0], argv.slice(1))
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

const PICTURE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * `presmium mcp tools` and `presmium mcp call <tool> [<json>] [--out <dir>]`: the tools of the service running for the
 * current directory (the one `presmium mcp` relays to), from the command line. A result goes to stdout as JSON, so that
 * it pipes; the pictures saved with `--out`, and every other line, go to stderr. Exits 1 when the tool fails, 2 on a
 * usage error or when no service can be reached.
 */
async function toolCommand(command: 'call' | 'tools', argv: string[]): Promise<number> {
  let tool = ''
  let args: Record<string, unknown> = {}
  let out: string | undefined
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
    if (values.help) {
      process.stdout.write(`${t.usage}\n`)
      return 0
    }
    if (command === 'tools') {
      if (positionals.length > 0) throw new Error(t.unexpectedToolArgument(positionals[0]!))
      if (values.out !== undefined) throw new Error(t.unexpectedToolArgument('--out'))
    } else {
      if (!positionals[0]) throw new Error(t.missingTool)
      if (positionals.length > 2) throw new Error(t.unexpectedToolArgument(positionals[2]!))
      tool = positionals[0]
      args = toolArguments(positionals[1] ?? '{}')
      out = values.out
    }
  } catch (error) {
    process.stderr.write(`presmium mcp: ${errorMessage(error)}\n\n${t.usage}\n`)
    return 2
  }
  const target = runningService(process.cwd())
  if (!target) {
    process.stderr.write(`presmium mcp: ${t.noService}\n`)
    return 2
  }
  let client: PresmiumMcpClient
  try {
    client = await connectPresmiumMcp(target.mcp, target.token, 'presmium-cli')
  } catch (error) {
    process.stderr.write(`presmium mcp: ${t.unreachable} (${errorMessage(error)})\n`)
    return 2
  }
  try {
    if (command === 'tools') {
      for (const listed of await client.tools()) process.stdout.write(`${listed.name}\t${listed.kind}\t${listed.description.replace(/\s+/g, ' ').split(/(?<=\.) /)[0]}\n`)
      return 0
    }
    const result = await client.call(tool, args)
    const value = result.structured ?? parsedText(result.text)
    process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
    if (result.images.length > 0 && out === undefined) process.stderr.write(`presmium mcp: ${t.notSaved(result.images.length)}\n`)
    if (result.images.length > 0 && out !== undefined) {
      mkdirSync(out, { recursive: true })
      result.images.forEach((image, i) => {
        const file = join(out, `${tool}-${String(i).padStart(2, '0')}.${PICTURE_EXTENSIONS[image.mimeType] ?? 'bin'}`)
        writeFileSync(file, Buffer.from(image.data, 'base64'))
        process.stderr.write(`presmium mcp: ${t.saved(file)}\n`)
      })
    }
    return result.isError ? 1 : 0
  } catch (error) {
    process.stderr.write(`presmium mcp: ${errorMessage(error)}\n`)
    return 2
  } finally {
    await client.close().catch(() => undefined)
  }
}

function toolArguments(text: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(t.badToolArguments(text))
  }
  if (!isRecord(value)) throw new Error(t.badToolArguments(text))
  return value
}

function parsedText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
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
