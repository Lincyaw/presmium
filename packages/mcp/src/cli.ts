import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PassThrough } from 'node:stream'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { APPROVAL_KINDS, errorMessage, isRecord, LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { devStateFile, fileVersion, findWorkspaceServiceState, readServiceState } from '@lincyaw/kernel/node'
import { buildSummary, buildToDist, Compiler, findPackageDir, resolveEntry, runBlock } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { bridgeStdio } from './bridge.ts'
import type { BridgeTarget } from './bridge.ts'
import { connectPresmiumMcp } from './client.ts'
import type { PresmiumMcpClient } from './client.ts'
import type { McpHost } from './host.ts'
import { createPresmiumMcp } from './mcp.ts'
import { MCP_CLI_MESSAGES, systemLocale } from './messages.ts'
import { isCatalogTool, queryToolCatalog } from './tool-catalog.ts'

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

export interface McpCliOptions {
  bundled?: string
  /** The application layer owns workspace startup, so MCP never imports its server implementation. */
  startWorkspace?(directory: string, allow: readonly ApprovalKind[], signal: AbortSignal): Promise<{ target: BridgeTarget, close(): Promise<void> }>
  /** Poll without starting a host, retaining the launcher's runtime-version requirement. */
  locateWorkspace?(directory: string): BridgeTarget | undefined
}

export async function main(argv: string[], options: McpCliOptions = {}): Promise<number | undefined> {
  if (argv[0] === 'call' || argv[0] === 'tools') return toolCommand(argv[0], argv.slice(1))
  let deck: string
  let allow: ApprovalKind[]
  let compilerOnly = false
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { allow: { type: 'string' }, 'compiler-only': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
    if (values.help) {
      process.stdout.write(`${t.usage}\n`)
      return 0
    }
    if (positionals.length > 1) throw new Error(t.unexpectedArgument(positionals[1]!))
    deck = resolveEntry(positionals[0] ?? '.')
    compilerOnly = values['compiler-only'] === true
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
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  process.stdin.once('end', stop); process.stdin.once('close', stop)
  // Consume stdin while the host starts, retaining protocol bytes and observing an early EOF immediately.
  const input = new PassThrough()
  process.stdin.pipe(input)
  let workspace: Awaited<ReturnType<NonNullable<McpCliOptions['startWorkspace']>>> | undefined
  const describe = (error: unknown) => errorMessage(error) === 'mcp-workspace-start-timeout' ? t.workspaceStartTimeout : errorMessage(error) === 'mcp-workspace-state-unavailable' ? t.workspaceStateUnavailable : errorMessage(error)
  const locate = async (ensure = true) => {
    controller.signal.throwIfAborted()
    if (compilerOnly) return undefined
    if (!ensure) return options.locateWorkspace ? options.locateWorkspace(dir) : runningWorkspaceService(dir)
    if (options.startWorkspace) {
      workspace = await options.startWorkspace(dir, allow, controller.signal)
      return workspace.target
    }
    const running = runningWorkspaceService(dir)
    if (!running) throw new Error(t.workspaceLauncherMissing)
    return running
  }
  try {
    const running = await locate()
    if (running) process.stderr.write(`${t.bridging(running.mcp)}\n`)
    await bridgeStdio(running, {
    locate, input, signal: controller.signal, unreachable: t.unreachable, invalidRequest: t.invalidRequest,
    log: message => process.stderr.write(`presmium mcp: ${describe(message)}\n`),
    connected: target => process.stderr.write(`${t.bridging(target.mcp)}\n`),
    ...compilerOnly ? { fallback: () => {
      const handler = createPresmiumMcp(compilerMcpHost(deck, allow, options.bundled))
      const transport = new StreamableHTTPClientTransport(new URL('http://presmium.local/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init), { member: LOCAL_AUTHOR, mode: 'author', document: '' }),
      })
      return { transport, async close() {
        const results = await Promise.allSettled([transport.close(), handler.close()])
        const failure = results.find(result => result.status === 'rejected')
        if (failure?.status === 'rejected') throw failure.reason
      } }
    } } : {},
  })
  } catch (error) {
    if (!controller.signal.aborted) {
      process.stderr.write(`presmium mcp: ${describe(error)}\n`)
      return 2
    }
  } finally {
    controller.abort()
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
    process.stdin.off('end', stop); process.stdin.off('close', stop)
    process.stdin.unpipe(input); process.stdin.pause(); input.destroy()
    await workspace?.close()
  }
  return 0
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
  let json = false
  let full = false
  let schemas = false
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, json: { type: 'boolean' }, all: { type: 'boolean' }, schema: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
    if (values.help) {
      process.stdout.write(`${t.usage}\n`)
      return 0
    }
    if (command === 'tools') {
      if (positionals.length > 1) throw new Error(t.unexpectedToolArgument(positionals[1]!))
      if (values.out !== undefined) throw new Error(t.unexpectedToolArgument('--out'))
      tool = positionals[0] ?? ''
      json = values.json === true || values.schema === true || tool !== ''
      full = values.all === true || tool !== ''
      schemas = values.schema === true
    } else {
      if (values.json !== undefined) throw new Error(t.unexpectedToolArgument('--json'))
      if (values.all !== undefined) throw new Error(t.unexpectedToolArgument('--all'))
      if (values.schema !== undefined) throw new Error(t.unexpectedToolArgument('--schema'))
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
    const url = new URL(target.mcp)
    if ((full || command === 'call') && !isCatalogTool(tool)) url.searchParams.set('tools', 'all')
    client = await connectPresmiumMcp(url.href, target.token, 'presmium-cli')
  } catch (error) {
    process.stderr.write(`presmium mcp: ${t.unreachable} (${errorMessage(error)})\n`)
    return 2
  }
  try {
    if (command === 'tools') {
      const tools = await client.tools()
      const selected = tool ? tools.find(listed => listed.name === tool) : undefined
      if (tool && !selected) {
        process.stderr.write(`presmium mcp: ${t.unknownTool(tool)}\n`)
        return 2
      }
      const overview = (listed: typeof tools[number]) => queryToolCatalog([listed], { name: listed.name })
      if (json) process.stdout.write(`${JSON.stringify(schemas ? selected ?? tools : selected ? overview(selected) : tools.map(overview))}\n`)
      else for (const listed of tools) process.stdout.write(`${listed.name}\t${listed.kind}\t${listed.description.replace(/\s+/g, ' ').split(/(?<=\.) /)[0]}\n`)
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
  const workspace = runningWorkspaceService(dir, env)
  if (workspace) return workspace
  let real: string
  try { real = realpathSync(resolve(dir)) } catch { return undefined }
  const dev = readServiceState(devStateFile(real))
  return dev ? { mcp: dev.mcp, token: dev.token, pid: dev.pid } : undefined
}

/** Authoring-capable workspace hosts, excluding a read-only document preview. */
export function runningWorkspaceService(dir: string, env: NodeJS.ProcessEnv = process.env): BridgeTarget | undefined {
  const found = findWorkspaceServiceState(dir, env)
  return found ? { mcp: found.state.mcp, token: found.state.token, pid: found.state.pid } : undefined
}
