/**
 * `presmium-mcp [deck] [--allow <kinds>]`: the agent environment on stdio,
 * for the agents of editors (Claude Code, Codex, VS Code). It implements the
 * `McpHost` on the compiler: one document, compiled again when its files
 * change; no pages, so no position, navigation or classroom. There is no page
 * to ask either, so operations are offered only for the approval kinds that
 * `--allow` names (`operate` gives `run_code` and `build`), and allowed then.
 * Like the CLI, it loads Presmium's own packages installed with the CLI (the
 * renderers and the operator plugin `addon-deltabox`): from the CLI's package
 * directory. Its checks, runs and builds are those of every host (F-03):
 * `Compilation.check`, `runBlock`, `buildView`.
 */
import { stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { errorMessage } from '@presmium/kernel'
import type { ApprovalKind, Member } from '@presmium/kernel'
import { buildView, Compiler, findPackageDir, resolveEntry, runBlock } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import type { McpHost } from './host.ts'
import { serveMcpStdio } from './mcp.ts'

/** The one member of a local process: the author, an owner. */
const AUTHOR: Member = { id: 'local', name: 'local author', roles: ['owner'] }
const KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']
/** This package's directory. */
const OWN_DIR = fileURLToPath(new URL('..', import.meta.url))
const CLI_PACKAGE = '@presmium/cli'


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

/** The `McpHost` of one deck on the compiler. */
export function compilerHost(entry: string, allow: readonly ApprovalKind[]): McpHost {
  // Where Presmium's own packages installed with the CLI resolve from (`CompilerOptions.bundled`), as for `presmium
  // check`: the CLI's package directory, the deck's CLI, else the one this package was installed with, else this package.
  const bundled = findPackageDir(CLI_PACKAGE, dirname(entry)) ?? findPackageDir(CLI_PACKAGE, OWN_DIR) ?? OWN_DIR
  const compiler = new Compiler(entry, { bundled })
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
    async compile(document) {
      const { doc } = await only(document)
      return { doc, diagnostics: doc.diagnostics }
    },
    async check(document) {
      const compilation = await only(document)
      return [...compilation.doc.diagnostics, ...await compilation.check()]
    },
    async build(document, options) {
      const report = await buildView(await only(document), { to: options.to })
      return { outputs: report.outputs.map(({ renderer, outDir }) => ({ renderer, outDir })), findings: report.findings }
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
