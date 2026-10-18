import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { errorMessage } from '@presmium/kernel'
import type { ApprovalKind, Finding, Severity } from '@presmium/kernel'
import { build, Compiler, dev, resolveEntry } from '@presmium/compiler'
import type { BuildReport, Compilation, RunStats } from '@presmium/compiler'
import { anyAddress, isLoopback, networkAddresses, servedDocument, startServer } from '@presmium/server'
import type { ApprovalPolicy } from '@presmium/server'
import { buildWorkspace, deckEditing, isWorkspaceRoot, serveWorkspace } from '@presmium/workspace'
import type { WorkspaceBuild } from '@presmium/workspace'
import { runCheck } from './check.ts'
import type { CheckResult } from './check.ts'
import { devHost } from './host.ts'

/**
 * The CLI's package directory: Presmium's own packages installed with the
 * CLI (the renderers, `addon-deltabox`) resolve from here (docs/architecture.md 10.6).
 */
export const BUNDLED = fileURLToPath(new URL('..', import.meta.url))

const USAGE = `Usage: presmium <command> [deck] [options]

The deck is a directory holding lecture.md, or an entry file (default: .).

Commands:
  build   compile and render; writes <out>/ir.json and <out>/<renderer>/; at a workspace root
          (presmium.workspace.yaml) builds the workspace site into <out>/web/
          --to <ids>      renderers to run, comma-separated (default: the deck's renderers)
          --out <dir>     output directory (default: <deck>/dist)
          --audience <name>  only the content for this audience (e.g. student); then every file
                          written is scanned for the sentences of the content left out
  dev     compile, start the Presmium server and the renderers' dev servers, recompile on save;
          the web form has edit mode (the source in the browser; its changes are committed
          where the deck is in a git repository)
          --to <ids>      renderers to run, comma-separated
          --out <dir>     working directory (default: <deck>/.presmium/dev)
          --server-port <n>  port of the Presmium server (default: a free port)
          --allow <kinds>    approvals given without asking: operate, spend, write, agent
  ir      print the IR as JSON
          --out <file>    write it to a file instead
  check   compile and run the plugins' checks
          --json          print the result as JSON
          --update-lock   re-resolve anchors and rewrite .presmium/anchors.lock.json
          --env           also connect to the environments of execute.environments
          --audience <name>  check the deck as compiled for this audience
          --external-links   also check the external links, with lychee when it is installed
  serve   the workspace service for you on this machine (the argument is the workspace root, or
          a deck): the workspace site, edit mode, the documents and their history, the plugins'
          routes, the classroom sync; without --host it listens on this machine only
          --port <n>      port (default: 4310)
          --host <addr>   address to listen on (default: 127.0.0.1); 0.0.0.0 or an address on the
                          local network opens it to your other devices there, with no login:
                          whoever reaches the port works as you
          --operator-dir <dir>  the operator directory (default: the user's state directory)

  -h, --help   show this help

Exit codes: 0 no errors, 1 error findings, 2 usage or internal error.`

const OPTIONS = {
  'build': ['to', 'out', 'audience'],
  'dev': ['to', 'out', 'server-port', 'allow'],
  'ir': ['out'],
  'check': ['json', 'update-lock', 'env', 'audience', 'external-links'],
  'serve': ['port', 'host', 'operator-dir'],
} as const

type Name = keyof typeof OPTIONS

const KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']

interface Command {
  name: Name
  /** The deck's entry file; for `serve`, the workspace root or deck directory. */
  entry: string
  /** `build` at a workspace root: the workspace site. */
  workspace?: string
  to?: string[]
  out?: string
  json: boolean
  updateLock: boolean
  /** `check --env`: probe the declared environments. */
  env: boolean
  /** `build`, `check`: compile for this audience only (P-55). */
  audience?: string
  /** `check --external-links`: lychee checks the external links (P-54). */
  externalLinks: boolean
  serverPort?: number
  allow: ApprovalKind[]
  operatorDir?: string
  port?: number
  host?: string
}

/** Runs `presmium <argv>` and returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  let command: Command | 'help'
  try {
    command = parseCommand(argv)
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
  if (command === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  try {
    switch (command.name) {
      case 'check': return await check(command)
      case 'ir': return await ir(command)
      case 'build': return await buildDeck(command)
      case 'dev': return await devDeck(command)
      case 'serve': return await serve(command)
    }
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n`)
    return 2
  }
}

function parseCommand(argv: string[]): Command | 'help' {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'to': { type: 'string' },
      'out': { type: 'string' },
      'json': { type: 'boolean', default: false },
      'update-lock': { type: 'boolean', default: false },
      'env': { type: 'boolean', default: false },
      'audience': { type: 'string' },
      'external-links': { type: 'boolean', default: false },
      'server-port': { type: 'string' },
      'allow': { type: 'string' },
      'operator-dir': { type: 'string' },
      'port': { type: 'string' },
      'host': { type: 'string' },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return 'help'
  const [name, deck = '.', ...extra] = positionals
  if (!name) throw new Error('missing command')
  if (!(name in OPTIONS)) throw new Error(`unknown command "${name}"`)
  const allowed: readonly string[] = OPTIONS[name as Name]
  const given = Object.entries(values).filter(([key, value]) => key !== 'help' && value !== undefined && value !== false)
  const wrong = given.find(([key]) => !allowed.includes(key))
  if (wrong) throw new Error(`option --${wrong[0]} does not apply to ${name}`)
  if (extra.length > 0) throw new Error(`unexpected argument "${extra[0]}"`)
  const workspace = name === 'build' && existsSync(deck) && statSync(deck).isDirectory() && isWorkspaceRoot(resolve(deck)) ? resolve(deck) : undefined
  if (workspace && values.to) throw new Error('--to does not apply to a workspace: its site is the web form')
  if (workspace && values.audience !== undefined) throw new Error('--audience does not apply to a workspace yet: build each document for its audience')
  const audience = values.audience?.trim()
  if (values.audience !== undefined && !/^[\w.-]+$/.test(audience ?? '')) throw new Error(`--audience takes the name of an audience, e.g. student, not "${values.audience}"`)
  // serve takes a directory: the workspace root, or a deck directory.
  const directory = name === 'serve'
  const entry = directory || workspace ? resolve(deck) : resolveEntry(deck)
  if (!existsSync(entry) || (directory && !statSync(entry).isDirectory())) throw new Error(`${entry} not found`)
  const to = values.to?.split(',').map(id => id.trim()).filter(Boolean)
  if (to?.length === 0) throw new Error('--to needs at least one renderer id')
  const allow = values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []
  const unknown = allow.find(kind => !(KINDS as string[]).includes(kind))
  if (unknown) throw new Error(`--allow takes ${KINDS.join(', ')}, not "${unknown}"`)
  return {
    name: name as Name,
    entry,
    ...workspace ? { workspace } : {},
    to,
    out: values.out,
    json: values.json,
    updateLock: values['update-lock'],
    env: values.env,
    ...audience ? { audience } : {},
    externalLinks: values['external-links'],
    serverPort: port(values['server-port'], '--server-port'),
    allow: allow as ApprovalKind[],
    operatorDir: values['operator-dir'],
    port: port(values.port, '--port'),
    host: values.host,
  }
}

function port(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${option} takes a port number, not "${value}"`)
  return n
}

async function check(command: Command): Promise<number> {
  const result = await runCheck({
    deck: command.entry,
    updateLock: command.updateLock,
    environments: command.env,
    externalLinks: command.externalLinks,
    compiler: { bundled: BUNDLED, ...command.audience ? { audience: command.audience } : {} },
  })
  process.stdout.write(command.json ? `${JSON.stringify(checkJson(result), null, 2)}\n` : checkText(result))
  return exitCode(result.findings)
}

async function ir(command: Command): Promise<number> {
  const { doc } = await new Compiler(command.entry, { bundled: BUNDLED }).compile()
  const json = `${JSON.stringify(doc, null, 2)}\n`
  if (command.out) {
    const file = resolve(command.out)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, json)
  } else {
    process.stdout.write(json)
  }
  process.stderr.write(findingLines(doc.diagnostics).join('\n') + (doc.diagnostics.length ? '\n' : ''))
  return exitCode(doc.diagnostics)
}

async function buildDeck(command: Command): Promise<number> {
  if (command.workspace) {
    const report = await buildWorkspace(command.workspace, { outDir: command.out, bundled: BUNDLED })
    process.stdout.write(workspaceText(report))
    return exitCode(report.findings)
  }
  const compilation = await new Compiler(command.entry, { bundled: BUNDLED, ...command.audience ? { audience: command.audience } : {} }).compile({ pruneCache: true })
  const outDir = resolve(command.out ?? join(compilation.deckDir, 'dist'))
  // For an audience, the build scans every file of the output directory for what was left out (P-55): a renderer's
  // directory a build of the whole deck left there would be published with it.
  const report = await build(compilation, { outDir, to: command.to })
  process.stdout.write(buildText(report, compilation.runs, compilation.audience?.name))
  return exitCode(report.findings)
}

/** The `.gitignore` line that keeps `presmium dev`'s MCP token (`<deck>/.presmium/server.json`) out of git, wherever the deck is in the repository. */
const TOKEN_IGNORE = '**/.presmium/server.json'

/**
 * `presmium dev`: the Presmium server (this machine only) with
 * the plugins' server contributions and the workspace's edit mode for the
 * deck (P-124: the source editor's routes, the document writer, its lock
 * and, in a git repository, its history), then the renderers' dev servers,
 * which proxy `/__presmium/` to it; the web form's loads the workspace's
 * browser plugin (docs/architecture.md 10.1, 10.2).
 */
async function devDeck(command: Command): Promise<number> {
  let latest: Compilation | undefined
  const deckDir = dirname(command.entry)
  const approvals: Partial<Record<ApprovalKind, ApprovalPolicy>> = Object.fromEntries(command.allow.map(kind => [kind, 'allow']))
  const host = devHost(() => latest)
  const editing = deckEditing(command.entry)
  const server = await startServer({
    mode: 'dev',
    port: command.serverPort,
    approvals,
    serverHost: host,
    document: async (dir) => {
      if (dir !== '' || !latest) return undefined
      const served = servedDocument(latest)
      return { ...served, plugins: [editing.plugin, ...served.plugins] }
    },
    stateFile: join(deckDir, '.presmium', 'server.json'),
  })
  if (!editing.git) process.stderr.write(`presmium dev: ${editing.root} is not in a git repository, or git ignores it: edit mode saves, but commits nothing and has no history (git init there to commit, with the line ${TOKEN_IGNORE} in .gitignore)\n`)
  else if (!editing.tokenIgnored) process.stderr.write(`presmium dev: git does not ignore .presmium/server.json, this process's MCP token: add the line ${TOKEN_IGNORE} to .gitignore (edit mode never commits it, git add would)\n`)
  const compiler = new Compiler(command.entry, { bundled: BUNDLED, services: [...server.services, ...editing.services] })
  const outDir = resolve(command.out ?? join(compiler.deckDir, '.presmium', 'dev'))
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, '.gitignore'), '*\n')
  let session
  try {
    session = await dev(compiler, {
      outDir,
      to: command.to,
      server: { url: server.url },
      sitePlugins: editing.sitePlugins,
      onCompile(compilation, findings) {
        latest = compilation
        const lines = findingLines(findings)
        lines.push(`compiled ${compilation.doc.sections.length} sections; ${summary(findings)}`)
        process.stdout.write(`${lines.join('\n')}\n`)
      },
    })
  } catch (error) {
    await server.close()
    throw error
  }
  for (const { renderer, url } of session.servers) process.stdout.write(`${renderer}  ${url}\n`)
  process.stdout.write(`server  ${server.url}\nmcp  ${server.url}/mcp (its token is in ${relative(process.cwd(), join(deckDir, '.presmium', 'server.json'))})\n`)
  process.stdout.write(`watching; IR in ${relative(process.cwd(), session.ir)}\n`)
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await session.close()
  await server.close()
  return 0
}

/**
 * `presmium serve`: the workspace service, on this machine, until stopped
 * (docs/architecture.md section 10). Prints its address, the workspace and
 * the MCP endpoint with the file that holds its token.
 */
async function serve(command: Command): Promise<number> {
  const started = await serveWorkspace({
    dir: command.entry,
    host: command.host,
    port: command.port,
    ...command.operatorDir ? { operatorDir: resolve(command.operatorDir) } : {},
    bundled: BUNDLED,
    check: compilation => compilation.check(),
  })
  process.stdout.write(`serve  ${started.url}\n${networkLines(command.host, started.url)}workspace  ${started.root}\nmcp  ${started.mcp.url} (its token is in ${started.mcp.stateFile})\n`)
  if (command.host && !isLoopback(command.host)) {
    process.stderr.write(`presmium serve: listening on ${command.host}, on the local network, with no login: anyone who reaches port ${new URL(started.url).port} uses this workspace as you (edits, runs code, approves). Use it on a network you trust; without --host it listens on this machine only.\n`)
  }
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await started.close()
  return 0
}

/** `network  <url>` for each address of the local network a `--host` of every interface (or that address) is reached at. */
function networkLines(host: string | undefined, url: string): string {
  if (!host || isLoopback(host)) return ''
  const { port } = new URL(url)
  const addresses = anyAddress(host) ? networkAddresses() : [host.includes(':') && !host.startsWith('[') ? `[${host}]` : host]
  return addresses.map(address => `network  http://${address}:${port}/\n`).join('')
}

function exitCode(findings: Finding[]): number {
  return findings.some(f => f.severity === 'error') ? 1 : 0
}

function counts(findings: Finding[]): Record<Severity, number> {
  const result: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) result[f.severity]++
  return result
}

function summary(findings: Finding[]): string {
  const n = counts(findings)
  return findings.length === 0 ? 'no problems' : `${n.error} errors, ${n.warning} warnings, ${n.info} infos`
}

function findingLines(findings: Finding[], cwd = process.cwd()): string[] {
  return findings.flatMap((f) => {
    const where = f.source ? `${relative(cwd, f.source.file)}${f.source.line ? `:${f.source.line}` : ''}` : ''
    return [`${where}  ${f.severity}  ${f.message}  (${f.checkId})`, ...f.hint ? [`    hint: ${f.hint}`] : []]
  })
}

function checkJson(result: CheckResult) {
  return { entry: result.entry, counts: counts(result.findings), findings: result.findings, lock: result.lock }
}

function checkText(result: CheckResult, cwd = process.cwd()): string {
  const out = findingLines(result.findings, cwd)
  if (result.lock) {
    const state = result.lock.changed ? 'updated' : 'unchanged'
    out.push(`${relative(cwd, result.lock.file)} ${state} (${result.lock.anchors} anchors)`)
  }
  out.push(summary(result.findings))
  return `${out.join('\n')}\n`
}

function workspaceText(report: WorkspaceBuild, cwd = process.cwd()): string {
  const out = findingLines(report.findings, cwd)
  for (const { dir, title, runs } of report.documents) {
    out.push(`document  ${dir || '.'}  ${title}${runs.executed + runs.cached > 0 ? `  (code runs: ${runs.executed} executed, ${runs.cached} from cache)` : ''}`)
  }
  out.push(`web  ${relative(cwd, report.outDir)}`)
  out.push(summary(report.findings))
  return `${out.join('\n')}\n`
}

function buildText(report: BuildReport, runs: RunStats, audience?: string, cwd = process.cwd()): string {
  const out = findingLines(report.findings, cwd)
  if (audience) out.push(`audience  ${audience}`)
  out.push(`ir  ${relative(cwd, report.ir)}`)
  for (const { renderer, outDir, skipped } of report.outputs) {
    out.push(`${renderer}  ${relative(cwd, outDir)}${skipped.length ? `  (${skipped.length} blocks not rendered)` : ''}`)
    for (const s of skipped) out.push(`    ${s.section}#${s.block}: ${s.reason}`)
  }
  if (runs.executed + runs.cached > 0) out.push(`code runs: ${runs.executed} executed, ${runs.cached} from cache${runs.sandbox && runs.executed > 0 ? `, isolated by ${runs.sandbox}` : ''}`)
  out.push(summary(report.findings))
  return `${out.join('\n')}\n`
}
