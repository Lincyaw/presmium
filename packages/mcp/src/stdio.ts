/**
 * `presmium-mcp [deck] [--allow <kinds>]`: the agent environment on stdio,
 * for the agents of editors (Claude Code, Codex, VS Code). It implements the
 * `McpHost` on the compiler: one document, compiled again when its files
 * change; no pages, so no position, navigation or classroom. There is no page
 * to ask either, so operations are offered only for the approval kinds that
 * `--allow` names (`operate` gives `run_code` and `build`), and allowed then.
 * Like the CLI, it loads Presmium's own packages installed with the CLI (the
 * renderers and the operator plugin `addon-deltabox`): from the CLI's package
 * directory (`bundledDir`).
 */
import { existsSync, realpathSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { CheckRegistry, errorMessage, irBlocks } from '@presmium/kernel'
import type { ApprovalKind, Finding, Member } from '@presmium/kernel'
import { build, Compiler, resolveEntry } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { McpHost } from './host.ts'
import { serveMcpStdio } from './mcp.ts'

/** The one member of a local process: the author, an owner. */
const AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }
const KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']
/** This package's directory. */
const OWN_DIR = fileURLToPath(new URL('..', import.meta.url))
const CLI_PACKAGE = '@presmium/cli'

/** The real directory of the package `name` in a `node_modules` from `from` upward. */
function packageUp(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const found = join(dir, 'node_modules', name)
    if (existsSync(join(found, 'package.json'))) return realpathSync(found)
    if (dirname(dir) === dir) return undefined
  }
}

/**
 * Where Presmium's own packages installed with the CLI resolve from
 * (`CompilerOptions.bundled`), as for `presmium check`: the CLI's package
 * directory. The CLI is the deck's (installed in its project), else the one
 * this package was installed with; without one, this package's directory.
 */
function bundledDir(deckDir: string): string {
  return packageUp(CLI_PACKAGE, deckDir) ?? packageUp(CLI_PACKAGE, OWN_DIR) ?? OWN_DIR
}

const USAGE = `Usage: presmium-mcp [deck] [--allow <kinds>]

Serves the deck (a directory holding lecture.md, or an entry file; default: .)
as MCP tools and resources on stdio, for the agent of an editor.

  --allow <kinds>  offer and allow these operations: operate (run_code, build), spend
  -h, --help       show this help`

/** The modification times of a compilation's files, to see when it is stale. */
async function stamps(files: string[]): Promise<string> {
  const times = await Promise.all(files.map(file => stat(file).then(s => s.mtimeMs, () => -1)))
  return times.join(',')
}

/** The plugins' checks of a compilation and the publication checks (P-54), as `presmium check` runs them. */
async function pluginChecks(compilation: Compilation): Promise<Finding[]> {
  const checks = new CheckRegistry()
  const findings: Finding[] = []
  for (const { name, plugin } of compilation.plugins) {
    for (const check of plugin?.checks ?? []) {
      try {
        checks.register(check)
      } catch (error) {
        findings.push({ checkId: 'presmium.plugins', severity: 'error', message: `plugin "${name}": ${errorMessage(error)}` })
      }
    }
  }
  return [...findings, ...await checks.run({
    deckDir: compilation.deckDir,
    workspaceRoot: compilation.workspaceRoot,
    headmatter: compilation.frontmatter,
    src: compilation.src,
    resolvers: compilation.resolvers,
    lock: compilation.lock.toJSON(),
    ir: compilation.doc,
    service: compilation.service,
  }), ...await compilation.publishChecks()]
}

/** The `McpHost` of one deck on the compiler. */
export function compilerHost(entry: string, allow: readonly ApprovalKind[]): McpHost {
  const compiler = new Compiler(entry, { bundled: bundledDir(dirname(entry)) })
  let latest: { compilation: Compilation, files: string[], stamp: string } | undefined
  let queue = Promise.resolve()
  /** The current compilation: compiled again when a file it read changed (one compilation at a time). */
  const current = () => {
    const next = queue.then(async () => {
      if (latest && await stamps(latest.files) === latest.stamp) return latest.compilation
      const compilation = await compiler.compile()
      const files = [...compilation.files, ...compilation.dependencies.files]
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
    // The student view is the whole deck until audiences are compiled (WP-87).
    async compile(document) {
      const { doc } = await only(document)
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = await only(document)
      return [...compilation.doc.diagnostics, ...await pluginChecks(compilation)]
    },
    async build(document, options) {
      const compilation = await only(document)
      const report = await build(compilation, { outDir: join(compilation.deckDir, 'dist'), to: options.to })
      return { outputs: report.outputs.map(({ renderer, outDir }) => ({ renderer, outDir })), findings: report.findings }
    },
    async run(document, target, signal) {
      const compilation = await only(document)
      const section = compilation.doc.sections.find(s => s.id === target.section)
      const block = section && [...irBlocks(section.blocks)].find(b => b.id === target.block)
      if (!block || block.node.type !== 'code') throw new Error(`no code block ${target.section}/${target.block}`)
      return compilation.run(block.node, signal)
    },
    approve: async request => allow.includes(request.kind),
    offers: kind => allow.includes(kind),
    async tools() {
      const compilation = await current()
      return { tools: compilation.plugins.flatMap(loaded => loaded.plugin?.tools ?? []), service: compilation.service }
    },
  }
}

/** Runs `presmium-mcp <argv>`: serves until stdin closes; returns an exit code on a usage error. */
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
    const unknown = allow.find(kind => !KINDS.includes(kind))
    if (unknown) throw new Error(`--allow takes ${KINDS.join(', ')}, not "${unknown}"`)
    await stat(deck).catch(() => {
      throw new Error(`${deck} not found`)
    })
  } catch (error) {
    process.stderr.write(`presmium-mcp: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
  serveMcpStdio(compilerHost(deck, allow), { member: AUTHOR, mode: 'author' })
  return undefined
}
