import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createJiti } from 'jiti'
import { APPROVAL_KINDS, deckLocale, errorMessage } from '@lincyaw/kernel'
import { bracketIPv6, irRevision, lanAddresses } from '@lincyaw/kernel/node'
import type { ApprovalKind, Finding, Severity, SpeechVoice } from '@lincyaw/kernel'
import { build, Compiler, dev, resolveEntry } from '@lincyaw/compiler'
import type { BuildReport, Compilation, RunStats } from '@lincyaw/compiler'
import { isAnyAddress, isLoopback, serverConfigKey, servedDocument, startServer } from '@lincyaw/server'
import type { ApprovalPolicy } from '@lincyaw/server'
import { buildWorkspace, isWorkspaceRoot, serveWorkspace } from '@lincyaw/workspace'
import type { WorkspaceBuild } from '@lincyaw/workspace'
import { runCheck } from './check.ts'
import { documentPatterns, importMarkdown } from './import.ts'
import type { CheckResult } from './check.ts'
import { devHost } from './dev-host.ts'
import { DocumentFileError, readDocumentFile, saveDocumentFile } from './document-file.ts'
import { CLI_MESSAGES, systemLocale } from './messages.ts'
import { exportScript, importScript, ScriptError } from './script.ts'
import { runSpeechKey, SpeechKeyFailure } from './speech-key.ts'
import { runVoiceover, VoiceoverFailure } from './voiceover.ts'

const BUNDLED = fileURLToPath(new URL('..', import.meta.url))
const PRESMIUM_BIN = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))

export interface MainOptions {
  /** The package whose dependencies hold the renderers and plugins a document does not install itself. */
  bundled?: string
  /** The presmium command that presmium studio starts. */
  bin?: string
}

const t = CLI_MESSAGES[systemLocale()]

const OPTIONS = {
  'build': ['to', 'out', 'audience'],
  'dev': ['to', 'out', 'server-port', 'allow'],
  'ir': ['out'],
  'check': ['json', 'update-lock', 'env', 'audience', 'external-links'],
  'serve': ['port', 'host', 'operator-dir', 'preview-origin', 'public-url', 'allow'],
} as const

type Name = keyof typeof OPTIONS

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
  listenAddress?: string
  previewOrigins: string[]
  publicUrl?: string
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  const bundled = options.bundled ?? BUNDLED
  if (argv[0] === 'new') return runNewCommand(argv.slice(1), bundled)
  if (argv[0] === 'skills') return (await import('@lincyaw/skills')).main(argv.slice(1))
  if (argv[0] === 'studio') return runStudioCommand(argv.slice(1), bundled, options.bin ?? PRESMIUM_BIN)
  if (argv[0] === 'mcp') return runMcpCommand(argv.slice(1), bundled)
  if (argv[0] === 'import') return runImportCommand(argv.slice(1))
  if (argv[0] === 'voiceover') return runVoiceoverCommand(argv.slice(1), bundled)
  if (argv[0] === 'speech') return runSpeechCommand(argv.slice(1))
  if (argv[0] === 'script') return runScriptCommand(argv.slice(1))
  let command: Command | 'help'
  try {
    command = parseCommand(argv)
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n\n${t.usage}\n`)
    return 2
  }
  if (command === 'help') {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  try {
    switch (command.name) {
      case 'check': return await runCheckCommand(command, bundled)
      case 'ir': return await runIrCommand(command, bundled)
      case 'build': return await runBuildCommand(command, bundled)
      case 'dev': return await runDevCommand(command, bundled)
      case 'serve': return await runServeCommand(command, bundled)
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
      'public-url': { type: 'string' },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return 'help'
  const [name, deck = '.', ...extra] = positionals
  if (!name) throw new Error(t.missingCommand)
  if (!(name in OPTIONS)) throw new Error(t.unknownCommand(name))
  const allowed: readonly string[] = OPTIONS[name as Name]
  const given = Object.entries(values).filter(([key, value]) => key !== 'help' && value !== undefined && value !== false)
  const wrong = given.find(([key]) => !allowed.includes(key))
  if (wrong) throw new Error(t.optionNotFor(wrong[0], name))
  if (extra.length > 0) throw new Error(t.unexpectedArgument(extra[0]!))
  const workspace = name === 'build' && existsSync(deck) && statSync(deck).isDirectory() && isWorkspaceRoot(resolve(deck)) ? resolve(deck) : undefined
  if (workspace && values.to) throw new Error(t.toNotForWorkspace)
  if (workspace && values.audience !== undefined) throw new Error(t.audienceNotForWorkspace)
  const audience = values.audience?.trim()
  if (values.audience !== undefined && !/^[\w.-]+$/.test(audience ?? '')) throw new Error(t.badAudience(values.audience))
  const directory = name === 'serve'
  const entry = directory || workspace ? resolve(deck) : resolveEntry(deck)
  if (!existsSync(entry) || (directory && !statSync(entry).isDirectory())) throw new Error(t.notFound(entry))
  const to = values.to?.split(',').map(id => id.trim()).filter(Boolean)
  if (to?.length === 0) throw new Error(t.emptyTo)
  const allow = values.allow?.split(',').map(kind => kind.trim()).filter(Boolean) ?? []
  const unknown = allow.find(kind => !(APPROVAL_KINDS as readonly string[]).includes(kind))
  if (unknown) throw new Error(t.badAllow(APPROVAL_KINDS, unknown))
  const previewOrigins = values['preview-origin'] ?? []
  const notOrigin = previewOrigins.find(origin => !isOrigin(origin))
  if (notOrigin !== undefined) throw new Error(t.badPreviewOrigin(notOrigin))
  const publicUrl = values['public-url']
  if (publicUrl !== undefined && !isPublicUrl(publicUrl)) throw new Error(t.badPublicUrl(publicUrl))
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
    serverPort: parsePort(values['server-port'], '--server-port'),
    allow: allow as ApprovalKind[],
    operatorDir: values['operator-dir'],
    port: parsePort(values.port, '--port'),
    listenAddress: values.host,
    previewOrigins,
    ...publicUrl ? { publicUrl } : {},
  }
}

/** An http(s) address, optionally with the path a proxy forwards; no credentials, query or fragment. */
function isPublicUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
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

function parsePort(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(t.badPort(option, value))
  return n
}

async function runCheckCommand(command: Command, bundled: string): Promise<number> {
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

async function runIrCommand(command: Command, bundled: string): Promise<number> {
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

async function runBuildCommand(command: Command, bundled: string): Promise<number> {
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

async function runDevCommand(command: Command, bundled: string): Promise<number> {
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
  let devServers
  try {
    devServers = await dev(compiler, {
      outDir,
      to: command.to,
      server: { url: server.url },
      onCompile(compilation, findings) {
        const changed = latest && serverConfigKey(latest) !== serverConfigKey(compilation)
        latest = compilation
        const revision = irRevision(compilation.doc)
        server.diagnostics.compiled('', compilation.doc, compilation.workspaceRoot, revision)
        server.diagnostics.replace({ document: '', origin: 'preview' }, findings.filter(finding => finding.checkId === 'presmium.render'), { root: compilation.workspaceRoot, irRevision: revision })
        if (changed) void server.unmount('', { preserveFocus: true }).catch((error: unknown) => {
          process.stderr.write(`${t.unmountFailed(errorMessage(error))}\n`)
        })
        const lines = findingLines(findings)
        lines.push(t.compiled(compilation.doc.sections.length, summary(findings)))
        process.stdout.write(`${lines.join('\n')}\n`)
      },
    })
  } catch (error) {
    await server.close()
    throw error
  }
  for (const { renderer, url } of devServers.servers) process.stdout.write(`${renderer}  ${url}\n`)
  process.stdout.write(`server  ${server.url}\nmcp  ${server.url}/mcp${t.token(relative(process.cwd(), join(deckDir, '.presmium', 'server.json')))}\n`)
  process.stdout.write(`${t.watching(relative(process.cwd(), devServers.ir))}\n`)
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await devServers.close()
  await server.close()
  return 0
}

async function runServeCommand(command: Command, bundled: string): Promise<number> {
  const started = await serveWorkspace({
    dir: command.entry,
    listenAddress: command.listenAddress,
    port: command.port,
    ...command.operatorDir ? { operatorDir: resolve(command.operatorDir) } : {},
    bundled,
    check: compilation => compilation.check(),
    previewOrigins: command.previewOrigins,
    ...command.publicUrl ? { publicUrl: command.publicUrl } : {},
    allow: command.allow,
  })
  process.stdout.write(`serve  ${started.url}\n${networkLines(command.listenAddress, started.url)}workspace  ${started.root}\nmcp  ${started.mcp.url}${t.token(started.mcp.stateFile)}\n`)
  if (command.listenAddress && !isLoopback(command.listenAddress)) {
    process.stderr.write(`${t.serveOpen(command.listenAddress, new URL(started.url).port)}\n`)
  }
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await started.close()
  return 0
}

function resolveInstalled(name: string, bundled: string): string | undefined {
  for (const from of [pathToFileURL(join(bundled, 'package.json')).href, import.meta.url, pathToFileURL(join(process.cwd(), 'package.json')).href]) {
    try {
      return createRequire(from).resolve(name)
    } catch {
    }
  }
  return undefined
}

async function runNewCommand(argv: string[], bundled: string): Promise<number> {
  const entry = resolveInstalled('create-presmium', bundled)
  if (!entry) {
    process.stderr.write(`${t.newMissing}\n`)
    return 2
  }
  const { main: createMain } = await createJiti(import.meta.url).import<{ main(argv: string[]): Promise<number> }>(entry)
  return createMain(argv)
}

/** Markdown notes to documents; prints what it wrote, the links it could not resolve and the patterns that list them. */
function runImportCommand(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: {
      out: { type: 'string' }, exclude: { type: 'string', multiple: true }, lang: { type: 'string' }, group: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false },
    } })
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n\n${t.usage}\n`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  const [input, ...extra] = positionals
  if (!input) {
    process.stderr.write(`presmium: ${t.importMissing}\n`)
    return 2
  }
  if (extra.length > 0) {
    process.stderr.write(`presmium: ${t.unexpectedArgument(extra[0]!)}\n`)
    return 2
  }
  if (!existsSync(input)) {
    process.stderr.write(`presmium: ${t.notFound(input)}\n`)
    return 2
  }
  const group = values.group === undefined ? undefined : Number(values.group)
  if (group !== undefined && !(Number.isInteger(group) && group >= 1)) {
    process.stderr.write(`presmium: ${t.badGroup(values.group!)}\n`)
    return 2
  }
  const out = resolve(values.out ?? '.')
  const report = importMarkdown(input, { out, exclude: values.exclude, lang: values.lang, group })
  for (const { note, link } of report.unresolved) process.stderr.write(`${t.importUnresolved(note, link)}\n`)
  process.stdout.write(`${t.imported(report.documents.length, report.files, relative(process.cwd(), out) || '.')}\n`)
  if (report.documents.length > 0) process.stdout.write(`${t.importPatterns(documentPatterns(report.documents))}\n`)
  return 0
}

const HELP = { type: 'boolean', short: 'h', default: false } as const

function usageError(error: unknown): number {
  process.stderr.write(`presmium: ${errorMessage(error)}\n\n${t.usage}\n`)
  return 2
}

function fail(message: string, code: number): number {
  process.stderr.write(`presmium: ${message}\n`)
  return code
}

/** A path as typed from here: relative below the working directory, absolute elsewhere. */
function shownPath(path: string): string {
  const shown = relative(process.cwd(), path)
  return !shown ? '.' : shown.startsWith('..') ? path : shown
}

function documentFileMessage(error: DocumentFileError): string {
  return error.code === 'document-changed' ? t.documentChanged : t.documentInvalid(error.detail)
}

/** The deck's entry, or a usage error already printed. */
function deckEntry(deck: string): string | undefined {
  try {
    const entry = resolveEntry(deck)
    if (existsSync(entry)) return entry
    fail(t.notFound(entry), 2)
  } catch (error) {
    fail(errorMessage(error), 2)
  }
  return undefined
}

async function runVoiceoverCommand(argv: string[], bundled: string): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { voice: { type: 'string' }, yes: { type: 'boolean', default: false }, prune: { type: 'boolean', default: false }, json: { type: 'boolean', default: false }, help: HELP } })
  } catch (error) {
    return usageError(error)
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  const [deck = '.', ...extra] = positionals
  if (extra.length > 0) return fail(t.unexpectedArgument(extra[0]!), 2)
  let voice: SpeechVoice | undefined
  if (values.voice !== undefined) {
    const at = values.voice.indexOf(':'), engine = values.voice.slice(0, Math.max(at, 0)).trim(), id = values.voice.slice(at + 1).trim()
    if (at < 0 || !engine || !id) return fail(t.badVoice(values.voice), 2)
    voice = { engine, voice: id }
  }
  const entry = deckEntry(deck)
  if (!entry) return 2
  try {
    return await runVoiceover({ entry, ...voice ? { voice } : {}, yes: values.yes, prune: values.prune, json: values.json, bundled }, t)
  } catch (error) {
    if (error instanceof VoiceoverFailure) return fail(error.message, 1)
    if (error instanceof DocumentFileError) return fail(documentFileMessage(error), 1)
    return fail(errorMessage(error), 2)
  }
}

async function runSpeechCommand(argv: string[]): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { help: HELP } })
  } catch (error) {
    return usageError(error)
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  const [group, action, dir = '.', ...extra] = positionals
  if (group !== 'key' || (action !== 'set' && action !== 'clear' && action !== 'status')) return fail(t.speechUsage, 2)
  if (extra.length > 0) return fail(t.unexpectedArgument(extra[0]!), 2)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(t.notFound(resolve(dir)), 2)
  try {
    return await runSpeechKey(action, resolve(dir), t)
  } catch (error) {
    return fail(errorMessage(error), error instanceof SpeechKeyFailure ? 1 : 2)
  }
}

/** The narration as one Markdown file to polish (`export`), and the polished file back into lecture.json (`import`). */
async function runScriptCommand(argv: string[]): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, help: HELP } })
  } catch (error) {
    return usageError(error)
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  const [action, deck, file, ...extra] = positionals
  if (action !== 'export' && action !== 'import') return fail(t.scriptUsage, 2)
  if (!deck) return fail(t.scriptUsage, 2)
  const unexpected = action === 'export' ? file ?? extra[0] : extra[0]
  if (unexpected !== undefined) return fail(t.unexpectedArgument(unexpected), 2)
  if (action === 'import' && values.out !== undefined) return fail(t.optionNotFor('out', 'script import'), 2)
  const entry = deckEntry(deck)
  if (!entry) return 2
  const fallback = join(dirname(entry), 'dist', 'script.md')
  try {
    const source = readDocumentFile(entry)
    if (action === 'export') {
      const out = resolve(values.out ?? fallback)
      const written = exportScript(source.document, CLI_MESSAGES[deckLocale(source.document.metadata.lang)].scriptInstructions)
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, written.text)
      process.stdout.write(`${t.scriptExported(shownPath(out), written.narrations, written.steps)}\n`)
      return 0
    }
    const input = resolve(file ?? fallback)
    if (!existsSync(input)) return fail(t.notFound(input), 2)
    const { document, changed } = importScript(source.document, await readFile(input, 'utf8'))
    if (changed.length === 0) {
      process.stdout.write(`${t.scriptUnchanged}\n`)
      return 0
    }
    saveDocumentFile(source, document)
    process.stdout.write(`${t.scriptImported(changed)}\n${t.scriptNext(shownPath(dirname(entry)))}\n`)
    return 0
  } catch (error) {
    if (error instanceof ScriptError) return fail(t.scriptErrors[error.code](error.detail, error.line), 1)
    if (error instanceof DocumentFileError) return fail(documentFileMessage(error), 1)
    return fail(errorMessage(error), 2)
  }
}

async function runStudioCommand(argv: string[], bundled: string, presmiumBin: string): Promise<number> {
  const entry = resolveInstalled('@lincyaw/studio', bundled)
  if (!entry) {
    process.stderr.write(`${t.studioMissing}\n`)
    return 2
  }
  const { main: studioMain } = await createJiti(import.meta.url).import<{ main(argv: string[], options: { presmium: string }): Promise<number> }>(entry)
  return studioMain(argv, { presmium: presmiumBin })
}

/** MCP on stdio, from the installed `@lincyaw/mcp`; stdout carries only its messages. */
async function runMcpCommand(argv: string[], bundled: string): Promise<number> {
  const entry = resolveInstalled('@lincyaw/mcp/cli', bundled)
  if (!entry) {
    process.stderr.write(`${t.mcpMissing}\n`)
    return 2
  }
  console.log = console.info = console.debug = console.error
  const { main: mcpMain } = await createJiti(import.meta.url).import<{ main(argv: string[], options: { bundled: string }): Promise<number | undefined> }>(entry)
  return await mcpMain(argv, { bundled }) ?? 0
}

function networkLines(listenAddress: string | undefined, url: string): string {
  if (!listenAddress || isLoopback(listenAddress)) return ''
  const { port } = new URL(url)
  const addresses = isAnyAddress(listenAddress) ? lanAddresses() : [bracketIPv6(listenAddress)]
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
  return findings.length === 0 ? t.noProblems : t.counts(n.error, n.warning, n.info)
}

function findingLines(findings: Finding[], cwd = process.cwd()): string[] {
  return findings.flatMap((f) => {
    const where = f.source ? `${relative(cwd, f.source.file)}${f.source.line ? `:${f.source.line}` : ''}` : ''
    return [`${where}  ${t.severity[f.severity]}  ${f.message}  (${f.checkId})`, ...f.hint ? [t.hint(f.hint)] : []]
  })
}

function checkJson(result: CheckResult) {
  return { entry: result.entry, counts: counts(result.findings), findings: result.findings, lock: result.lock }
}

function checkText(result: CheckResult, cwd = process.cwd()): string {
  const out = findingLines(result.findings, cwd)
  if (result.lock) {
    out.push(t.lock(relative(cwd, result.lock.file), result.lock.changed, result.lock.anchors))
  }
  out.push(summary(result.findings))
  return `${out.join('\n')}\n`
}

function workspaceText(report: WorkspaceBuild, cwd = process.cwd()): string {
  const out = findingLines(report.findings, cwd)
  for (const { dir, title, runs } of report.documents) {
    out.push(`document  ${dir || '.'}  ${title}${runs.executed + runs.cached > 0 ? t.documentRuns(runs.executed, runs.cached) : ''}`)
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
    out.push(`${renderer}  ${relative(cwd, outDir)}${skipped.length ? t.notRendered(skipped.length) : ''}`)
    for (const s of skipped) out.push(`    ${s.section}#${s.block}: ${s.reason}`)
  }
  if (runs.executed + runs.cached > 0) out.push(t.codeRuns(runs.executed, runs.cached, runs.sandbox && runs.executed > 0 ? runs.sandbox : undefined))
  out.push(summary(report.findings))
  return `${out.join('\n')}\n`
}
