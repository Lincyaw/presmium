import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createJiti } from 'jiti'
import { errorMessage } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { ApprovalKind, Finding, Severity } from '@lincyaw/kernel'
import { build, Compiler, dev, resolveEntry } from '@lincyaw/compiler'
import type { BuildReport, Compilation, RunStats } from '@lincyaw/compiler'
import { anyAddress, isLoopback, networkAddresses, serverConfiguration, servedDocument, startServer } from '@lincyaw/server'
import type { ApprovalPolicy } from '@lincyaw/server'
import { buildWorkspace, isWorkspaceRoot, serveWorkspace } from '@lincyaw/workspace'
import type { WorkspaceBuild } from '@lincyaw/workspace'
import { runCheck } from './check.ts'
import type { CheckResult } from './check.ts'
import { devHost } from './host.ts'

export const BUNDLED = fileURLToPath(new URL('..', import.meta.url))

export interface MainOptions {
  bundled?: string
  bin?: string
}

let bundled = BUNDLED
let presmiumBin = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))

const USAGE = `Usage: presmium <command> [deck] [options]

The deck is a directory holding lecture.md, or an entry file (default: .).

Commands:
  new     a new project in the directory (default: asks), from create-presmium
          --type <kind>   lecture, workspace or plugin (default: asks)
          --title <text>  the lecture's or the workspace's title
          --name <name>   the plugin's package name
          --no-git        do not run git init
  build   compile and render; writes <out>/ir.json and <out>/<renderer>/; at a workspace root
          (presmium.workspace.yaml) builds the workspace site into <out>/web/
          --to <ids>      renderers to run, comma-separated (default: the deck's renderers)
          --out <dir>     output directory (default: <deck>/dist)
          --audience <name>  only the content for this audience (e.g. student); then every file
                          written is scanned for the sentences of the content left out
  dev     compile, start the Presmium server and the renderers' dev servers, recompile on save
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
          a deck): the workspace site, the documents and their history, the reviews, the plugins'
          routes, the classroom sync; without --host it listens on this machine only
          --port <n>      port (default: 4310)
          --host <addr>   address to listen on (default: 127.0.0.1); 0.0.0.0 or an address on the
                          local network opens it to your other devices there, with no login:
                          whoever reaches the port works as you
          --operator-dir <dir>  the operator directory (default: the user's state directory)
          --preview-origin <origin>  (repeatable) the origin of a workbench whose pages embed the
                          previews, e.g. http://127.0.0.1:4320; with PRESMIUM_SERVICE_TOKEN set, the
                          workspace's routes ask for it (Authorization: Bearer)
  studio  the workbench (experimental): DeepSeek Harness with Presmium's bundle and the workspace
          service of the directory (the workspace root, or a deck); prints the one address to open.
          It is the package @lincyaw/studio (with DeepSeek Harness, about 865 MB), installed beside
          this one
          --port <n>      the workbench's port (default: 4320, or a free one when that is in use)
          --host <addr>   listen on this address of the machine on the local network instead of
                          127.0.0.1, with no login: whoever reaches the port works as you

  -h, --help   show this help

Exit codes: 0 no errors, 1 error findings, 2 usage or internal error.`

const OPTIONS = {
  'build': ['to', 'out', 'audience'],
  'dev': ['to', 'out', 'server-port', 'allow'],
  'ir': ['out'],
  'check': ['json', 'update-lock', 'env', 'audience', 'external-links'],
  'serve': ['port', 'host', 'operator-dir', 'preview-origin'],
} as const

type Name = keyof typeof OPTIONS

const KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']

interface Command {
  name: Name
  entry: string
  workspace?: string
  to?: string[]
  out?: string
  json: boolean
  updateLock: boolean
  env: boolean
  audience?: string
  externalLinks: boolean
  serverPort?: number
  allow: ApprovalKind[]
  operatorDir?: string
  port?: number
  host?: string
  previewOrigins: string[]
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  bundled = options.bundled ?? BUNDLED
  if (options.bin) presmiumBin = options.bin
  if (argv[0] === 'new') return create(argv.slice(1))
  if (argv[0] === 'studio') return studio(argv.slice(1))
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
      'preview-origin': { type: 'string', multiple: true },
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
  const directory = name === 'serve'
  const entry = directory || workspace ? resolve(deck) : resolveEntry(deck)
  if (!existsSync(entry) || (directory && !statSync(entry).isDirectory())) throw new Error(`${entry} not found`)
  const to = values.to?.split(',').map(id => id.trim()).filter(Boolean)
  if (to?.length === 0) throw new Error('--to needs at least one renderer id')
  const allow = values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []
  const unknown = allow.find(kind => !(KINDS as string[]).includes(kind))
  if (unknown) throw new Error(`--allow takes ${KINDS.join(', ')}, not "${unknown}"`)
  const previewOrigins = values['preview-origin'] ?? []
  const notOrigin = previewOrigins.find(origin => !isOrigin(origin))
  if (notOrigin !== undefined) throw new Error(`--preview-origin takes an origin such as http://127.0.0.1:4320, not "${notOrigin}"`)
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
    previewOrigins,
  }
}

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) && url.origin === value
  } catch {
    return false
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
    compiler: { bundled, ...command.audience ? { audience: command.audience } : {} },
  })
  process.stdout.write(command.json ? `${JSON.stringify(checkJson(result), null, 2)}\n` : checkText(result))
  return exitCode(result.findings)
}

async function ir(command: Command): Promise<number> {
  const { doc } = await new Compiler(command.entry, { bundled }).compile()
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
    const report = await buildWorkspace(command.workspace, { outDir: command.out, bundled })
    process.stdout.write(workspaceText(report))
    return exitCode(report.findings)
  }
  const compilation = await new Compiler(command.entry, { bundled, ...command.audience ? { audience: command.audience } : {} }).compile({ pruneCache: true })
  const outDir = resolve(command.out ?? join(compilation.deckDir, 'dist'))
  const report = await build(compilation, { outDir, to: command.to })
  process.stdout.write(buildText(report, compilation.runStats, compilation.audience?.name))
  return exitCode(report.findings)
}

async function devDeck(command: Command): Promise<number> {
  let latest: Compilation | undefined
  const deckDir = dirname(command.entry)
  const approvals: Partial<Record<ApprovalKind, ApprovalPolicy>> = Object.fromEntries(command.allow.map(kind => [kind, 'allow']))
  const host = devHost(() => latest)
  const server = await startServer({
    mode: 'dev',
    port: command.serverPort,
    approvals,
    serverHost: host,
    document: async dir => (dir === '' && latest ? servedDocument(latest) : undefined),
    stateFile: join(deckDir, '.presmium', 'server.json'),
  })
  const compiler = new Compiler(command.entry, { bundled, priority: 'interactive', services: server.services })
  const outDir = resolve(command.out ?? join(compiler.deckDir, '.presmium', 'dev'))
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, '.gitignore'), '*\n')
  let session
  try {
    session = await dev(compiler, {
      outDir,
      to: command.to,
      server: { url: server.url },
      onCompile(compilation, findings) {
        const changed = latest && serverConfiguration(latest) !== serverConfiguration(compilation)
        latest = compilation
        const revision = irRevision(compilation.doc)
        server.diagnostics.compiled('', compilation.doc, compilation.workspaceRoot, revision)
        server.diagnostics.replace({ document: '', origin: 'preview' }, findings.filter(finding => finding.checkId === 'presmium.render'), { root: compilation.workspaceRoot, revision })
        if (changed) void server.unmount('', { preserveFocus: true }).catch((error: unknown) => {
          process.stderr.write(`presmium: the previous server contributions did not close: ${errorMessage(error)}\n`)
        })
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

async function serve(command: Command): Promise<number> {
  const started = await serveWorkspace({
    dir: command.entry,
    host: command.host,
    port: command.port,
    ...command.operatorDir ? { operatorDir: resolve(command.operatorDir) } : {},
    bundled,
    check: compilation => compilation.check(),
    previewOrigins: command.previewOrigins,
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

function installed(name: string): string | undefined {
  for (const from of [pathToFileURL(join(bundled, 'package.json')).href, import.meta.url, pathToFileURL(join(process.cwd(), 'package.json')).href]) {
    try {
      return createRequire(from).resolve(name)
    } catch {
    }
  }
  return undefined
}

async function create(argv: string[]): Promise<number> {
  const entry = installed('create-presmium')
  if (!entry) {
    process.stderr.write('presmium new: create-presmium is not installed; it comes with the presmium package: pnpm add -g @lincyaw/presmium\n')
    return 2
  }
  const { main: createMain } = await createJiti(import.meta.url).import<{ main(argv: string[]): Promise<number> }>(entry)
  return createMain(argv)
}

async function studio(argv: string[]): Promise<number> {
  const entry = installed('@lincyaw/studio')
  if (!entry) {
    process.stderr.write('presmium studio: the workbench is not installed here. It is the package @lincyaw/studio (experimental; with DeepSeek Harness, about 865 MB): pnpm add -g @lincyaw/studio, then run presmium-studio; or pnpm add -D @lincyaw/studio in this project.\n')
    return 2
  }
  const { main: studioMain } = await createJiti(import.meta.url).import<{ main(argv: string[], options: { presmium: string }): Promise<number> }>(entry)
  return studioMain(argv, { presmium: presmiumBin })
}

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
