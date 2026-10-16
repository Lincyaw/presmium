import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { errorMessage } from '@presmium/kernel'
import type { ApprovalKind, Finding, Severity } from '@presmium/kernel'
import { build, Compiler, dev, operatorDir, resolveEntry } from '@presmium/compiler'
import type { BuildReport, Compilation, RunStats } from '@presmium/compiler'
import { readSecret, servedDocument, startGateway, startServer } from '@presmium/server'
import type { ApprovalPolicy } from '@presmium/server'
import { runCheck } from './check.ts'
import type { CheckResult } from './check.ts'
import { devHost } from './host.ts'

/**
 * The CLI's package directory: Presmium's own packages installed with the
 * CLI (the renderers, `addon-deltabox`) resolve from here (D14, docs/architecture.md 10.6).
 */
export const BUNDLED = fileURLToPath(new URL('..', import.meta.url))

const USAGE = `Usage: presmium <command> [deck] [options]

The deck is a directory holding lecture.md, or an entry file (default: .).

Commands:
  build   compile and render; writes <out>/ir.json and <out>/<renderer>/
          --to <ids>      renderers to run, comma-separated (default: the deck's renderers)
          --out <dir>     output directory (default: <deck>/dist)
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
  gateway  the gateway of a shared deployment (the argument is the workspace root):
          the operator's plugins' gateway routes, scoped tokens, /mcp forwarded to serve;
          its service token is PRESMIUM_GATEWAY_TOKEN (or PRESMIUM_GATEWAY_TOKEN_FILE)
          --operator-dir <dir>  the operator directory (default: the user's state directory)
          --serve <url>   serve's address, where /mcp goes
          --port <n>      port (default: 4320)
          --host <addr>   address (default: 127.0.0.1)

  -h, --help   show this help

Exit codes: 0 no errors, 1 error findings, 2 usage or internal error.`

const OPTIONS = {
  build: ['to', 'out'],
  dev: ['to', 'out', 'server-port', 'allow'],
  ir: ['out'],
  check: ['json', 'update-lock'],
  gateway: ['operator-dir', 'serve', 'port', 'host'],
} as const

type Name = keyof typeof OPTIONS

const KINDS: readonly ApprovalKind[] = ['operate', 'spend', 'write', 'agent']

interface Command {
  name: Name
  /** The deck's entry file; for `gateway`, the workspace root. */
  entry: string
  to?: string[]
  out?: string
  json: boolean
  updateLock: boolean
  serverPort?: number
  allow: ApprovalKind[]
  operatorDir?: string
  serve?: string
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
      case 'gateway': return await gateway(command)
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
      'server-port': { type: 'string' },
      'allow': { type: 'string' },
      'operator-dir': { type: 'string' },
      'serve': { type: 'string' },
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
  const entry = name === 'gateway' ? resolve(deck) : resolveEntry(deck)
  if (!existsSync(entry) || (name === 'gateway' && !statSync(entry).isDirectory())) throw new Error(`${entry} not found`)
  const to = values.to?.split(',').map(id => id.trim()).filter(Boolean)
  if (to?.length === 0) throw new Error('--to needs at least one renderer id')
  const allow = values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []
  const unknown = allow.find(kind => !(KINDS as string[]).includes(kind))
  if (unknown) throw new Error(`--allow takes ${KINDS.join(', ')}, not "${unknown}"`)
  return {
    name: name as Name,
    entry,
    to,
    out: values.out,
    json: values.json,
    updateLock: values['update-lock'],
    serverPort: port(values['server-port'], '--server-port'),
    allow: allow as ApprovalKind[],
    operatorDir: values['operator-dir'],
    serve: values.serve,
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
  const result = await runCheck({ deck: command.entry, updateLock: command.updateLock, compiler: { bundled: BUNDLED } })
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
  const compilation = await new Compiler(command.entry, { bundled: BUNDLED }).compile({ pruneCache: true })
  const outDir = resolve(command.out ?? join(compilation.deckDir, 'dist'))
  const report = await build(compilation, { outDir, to: command.to })
  process.stdout.write(buildText(report, compilation.runs))
  return exitCode(report.findings)
}

/**
 * `presmium dev`: the Presmium server (this machine only, LOCAL mode) with
 * the plugins' server contributions, then the renderers' dev servers, which
 * proxy `/__presmium/` to it (docs/architecture.md 10.1, 10.2).
 */
async function devDeck(command: Command): Promise<number> {
  let latest: Compilation | undefined
  const deckDir = dirname(command.entry)
  const approvals: Partial<Record<ApprovalKind, ApprovalPolicy>> = Object.fromEntries(command.allow.map(kind => [kind, 'allow']))
  const host = devHost(() => latest, deckDir)
  const server = await startServer({
    mode: 'dev',
    port: command.serverPort,
    approvals,
    serverHost: host,
    document: async dir => (dir === '' && latest ? servedDocument(latest) : undefined),
    stateFile: join(deckDir, '.presmium', 'server.json'),
  })
  const compiler = new Compiler(command.entry, { bundled: BUNDLED, services: server.services })
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

/** `presmium gateway`: the gateway of a shared deployment, until stopped (docs/architecture.md 10.9). */
async function gateway(command: Command): Promise<number> {
  const token = readSecret(process.env, 'PRESMIUM_GATEWAY_TOKEN')
  if (!token) throw new Error('the gateway needs its service token: set PRESMIUM_GATEWAY_TOKEN or PRESMIUM_GATEWAY_TOKEN_FILE')
  const root = command.entry
  const started = await startGateway({
    workspace: root,
    operatorDir: command.operatorDir ? resolve(command.operatorDir) : operatorDir(root),
    serve: command.serve,
    port: command.port,
    host: command.host,
    token,
    bundled: BUNDLED,
  })
  process.stdout.write(`gateway  ${started.url}\nplugins  ${started.plugins.join(', ') || '(none)'}\n`)
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await started.close()
  return 0
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

function buildText(report: BuildReport, runs: RunStats, cwd = process.cwd()): string {
  const out = findingLines(report.findings, cwd)
  out.push(`ir  ${relative(cwd, report.ir)}`)
  for (const { renderer, outDir, skipped } of report.outputs) {
    out.push(`${renderer}  ${relative(cwd, outDir)}${skipped.length ? `  (${skipped.length} blocks not rendered)` : ''}`)
    for (const s of skipped) out.push(`    ${s.section}#${s.block}: ${s.reason}`)
  }
  if (runs.executed + runs.cached > 0) out.push(`code runs: ${runs.executed} executed, ${runs.cached} from cache`)
  out.push(summary(report.findings))
  return `${out.join('\n')}\n`
}
