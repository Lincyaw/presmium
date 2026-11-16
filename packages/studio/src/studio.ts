import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, isIP } from 'node:net'
import type { AddressInfo } from 'node:net'
import { homedir, hostname, networkInterfaces } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bracketIPv6, dshBin, inheritedEnv, isLauncherVariable, launchArgs, launchEnv, launchNode, launchWorkspaceServer, WEB_READY, writeProfile } from '@lincyaw/dsh/launch'
import type { LaunchedProcess } from '@lincyaw/dsh/launch'
import { findWorkspaceServiceState, readServiceState, serveStateDir } from '@lincyaw/kernel/node'
import { STUDIO_MESSAGES, systemLocale } from './messages.ts'
import { modelEnv } from './model-env.ts'
import { startProxy } from './proxy.ts'
import type { Proxy } from './proxy.ts'

const PROFILE = 'presmium-studio'
const DEFAULT_PORT = 4320
const DEFAULT_PREVIEW_PORT = 4321
const LOG_BYTES = 16 << 20

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

export interface StudioOptions {
  dir: string
  port?: number
  /** `--host`: one address of this machine to listen on instead of 127.0.0.1. */
  listenAddress?: string
  /**
   * When a reverse proxy fronts Studio (Presmium Cloud): the root browsers open, and the origin of the workspace
   * service's previews. Their hosts are trusted and advertised; the proxy keeps `Host` and forwards upgrades.
   */
  publicUrl?: string
  previewUrl?: string
  /** The workspace service and HTTP MCP port. Without it Studio uses 4321, or a free port when 4321 is in use; zero requests a free port. */
  previewPort?: number
  env?: NodeJS.ProcessEnv
  presmium?: string
  /** Live workspace-service output; the complete host output is also kept in `Studio.log`. */
  onServiceOutput?(text: string): void
}

export interface Studio {
  url: string
  networkUrls: string[]
  workspaceServerUrl: string
  /** `movedFrom` is the default port when it was in use and the MCP address differs from the usual one. */
  mcp: { url: string, tokenFile: string, movedFrom?: number }
  root: string
  home: string
  log: string
  /** `<home>/<profile>.json`: `url` (with its launch token), `workspace`, `workspaceServerUrl`, `pid`; 0600, removed on close. */
  state: string
  ended: Promise<string>
  close(): Promise<void>
}

function studioHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'studio')
}

/** Independent of the installation/profile so upgrades and restarts preserve external MCP access. */
function workspaceCredential(home: string, dir: string): { token: string, file: string } {
  const directory = join(home, 'mcp')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const id = createHash('sha256').update(realpathSync(dir)).digest('hex').slice(0, 32)
  const file = join(directory, `${id}.token`)
  try {
    writeFileSync(file, `${randomBytes(24).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  chmodSync(file, 0o600)
  const token = readFileSync(file, 'utf8').trim()
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new Error(STUDIO_MESSAGES[systemLocale()].badMcpToken(file))
  return { token, file }
}

/** The bundle `@lincyaw/dsh` this package depends on: the directory the profile links to. */
function bundleDir(): string {
  return realpathSync(dirname(createRequire(join(PACKAGE_DIR, 'package.json')).resolve('@lincyaw/dsh/package.json')))
}

/**
 * The profile of this installation, `presmium-studio-<hash of the bundle's directory>`: its `node_modules` links to
 * this installation's bundle, so Studios of other checkouts or versions sharing the home never repoint it. A new
 * one starts with the author's settings, the profile patch of the Studio profile used last (the earlier single
 * profile `presmium-studio` included); sessions and credentials are in the shared home, and its log is `<profile>.log` there.
 */
function installProfile(home: string, bundle: string): string {
  const name = `${PROFILE}-${createHash('sha256').update(bundle).digest('hex').slice(0, 10)}`
  const profiles = join(home, 'profiles')
  const patch = join(profiles, name, 'cordis.patch.yml')
  if (!existsSync(patch)) {
    const last = (existsSync(profiles) ? readdirSync(profiles) : [])
      .filter(other => other === PROFILE || other.startsWith(`${PROFILE}-`))
      .map(other => join(profiles, other, 'cordis.patch.yml'))
      .filter(file => existsSync(file))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    if (last) {
      mkdirSync(dirname(patch), { recursive: true })
      copyFileSync(last, patch)
    }
  }
  return name
}

/**
 * The `presmium` command a Studio started by itself (`presmium-studio`) runs: `@lincyaw/presmium` where it can be
 * resolved from here, else the one on PATH. `presmium studio` passes its own instead; Studio does not depend on it, which
 * would make the two packages depend on each other.
 */
function presmiumBin(env: NodeJS.ProcessEnv, missing: string): string {
  try {
    return join(dirname(createRequire(join(PACKAGE_DIR, 'package.json')).resolve('@lincyaw/presmium/package.json')), 'bin', 'presmium.mjs')
  } catch {}
  const names = process.platform === 'win32' ? ['presmium.cmd', 'presmium'] : ['presmium']
  for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const script = existsSync(join(dir, name)) ? nodeScript(join(dir, name)) : undefined
      if (script) return script
    }
  }
  throw new Error(missing)
}

/** The Node script a command runs: the file itself (an npm link), or the target a pnpm shim names. */
function nodeScript(command: string): string | undefined {
  try {
    const file = realpathSync(command)
    const head = readFileSync(file, 'utf8').slice(0, 4096)
    if (/\.[cm]?js$/.test(file) || /^#!.*\bnode\b/.test(head)) return file
    const target = /cmd-shim-target=(.+)$/m.exec(head)?.[1]?.trim()
    return target && existsSync(target) ? target : undefined
  } catch {
    return undefined
  }
}

const WILDCARD = /^0\.0\.0\.0$/

function networkHosts(): string[] {
  return [...new Set(Object.values(networkInterfaces()).flatMap(entries => entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal).map(entry => entry.address))]
}

function authority(host: string, port: number): string {
  return `${bracketIPv6(host)}:${port}`
}

function httpOrigin(host: string, port: number): string {
  return `http://${authority(host, port)}`
}

function studioUrl(backend: string, publicUrl: string | undefined, host: string, port: number): string {
  const token = new URL(backend).searchParams.get('token')
  if (!token) throw new Error('DeepSeek Harness printed an address without its launch token')
  const url = new URL(publicUrl ?? `http://${authority(host, port)}/`)
  url.searchParams.set('token', token)
  return url.href
}

function freePort(listenAddress: string, port: number): Promise<number | undefined> {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(undefined))
    server.listen(port, listenAddress, () => {
      const bound = (server.address() as AddressInfo).port
      server.close(() => done(bound))
    })
  })
}

async function choosePort(listenAddress: string, port: number | undefined, preferred?: number): Promise<number> {
  if (port) {
    if (await freePort(listenAddress, port) === undefined) throw new Error(STUDIO_MESSAGES[systemLocale()].portInUse(port, listenAddress))
    return port
  }
  const chosen = (port === undefined ? (preferred ? await freePort(listenAddress, preferred) : undefined) ?? await freePort(listenAddress, DEFAULT_PORT) : undefined) ?? await freePort(listenAddress, 0)
  if (chosen === undefined) throw new Error(STUDIO_MESSAGES[systemLocale()].noFreePort(listenAddress))
  return chosen
}

class Log {
  readonly file: string
  #fd: number
  #bytes = 0
  readonly #rest = new Map<string, string>()

  constructor(file: string) {
    this.file = file
    this.#fd = openSync(file, 'w', 0o600)
  }

  write(name: string, text: string): void {
    if (this.#fd < 0) return
    const lines = ((this.#rest.get(name) ?? '') + text).split('\n')
    this.#rest.set(name, lines.pop()!)
    if (lines.length === 0) return
    const out = lines.map(line => `${new Date().toISOString()} [${name}] ${line}\n`).join('')
    if (this.#bytes + out.length > LOG_BYTES) {
      closeSync(this.#fd)
      renameSync(this.file, `${this.file}.1`)
      this.#fd = openSync(this.file, 'w', 0o600)
      this.#bytes = 0
    }
    this.#bytes += writeSync(this.#fd, out)
  }

  close(): void {
    if (this.#fd < 0) return
    for (const [name, rest] of this.#rest) if (rest) this.write(name, '\n')
    closeSync(this.#fd)
    this.#fd = -1
  }
}

export async function startStudio(options: StudioOptions): Promise<Studio> {
  const env = options.env ?? process.env
  const t = STUDIO_MESSAGES[systemLocale(env)]
  const { listenAddress } = options
  if (listenAddress !== undefined && isIP(listenAddress) === 0) {
    throw new Error(t.badHost(listenAddress))
  }
  const boundAddress = listenAddress ?? '127.0.0.1'
  let existing = findWorkspaceServiceState(options.dir, env)
  const canReuse = () => existing?.state.launcherToken && listenAddress === undefined && options.previewPort === undefined && options.previewUrl === undefined
  if (existing && !canReuse()) throw new Error(t.existingService(existing.state.url))
  const wildcard = WILDCARD.test(boundAddress)
  // External MCP clients keep the default address, so it is preferred; an explicit port must be free.
  let previewPort = options.previewPort ?? DEFAULT_PREVIEW_PORT
  let movedFrom: number | undefined
  if (!existing && previewPort !== 0 && await freePort(boundAddress, previewPort) === undefined) {
    if (options.previewPort !== undefined) throw new Error(t.previewPortInUse(previewPort, boundAddress))
    movedFrom = previewPort
    previewPort = 0
  }
  const home = studioHome(env)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  // Preserve the browser origin (and its caches/return state) when the default port is held by another app.
  const portFile = options.port === undefined && listenAddress === undefined && !options.publicUrl
    ? join(home, 'ports', `${createHash('sha256').update(realpathSync(options.dir)).digest('hex').slice(0, 32)}.json`) : undefined
  let preferredPort: number | undefined
  if (portFile) {
    try {
      const saved = JSON.parse(readFileSync(portFile, 'utf8')) as { port?: unknown }
      if (typeof saved.port === 'number' && Number.isInteger(saved.port) && saved.port > 0 && saved.port <= 65535) preferredPort = saved.port
    } catch { /* A missing preference uses the normal default/free-port selection. */ }
  }
  const port = await choosePort(boundAddress, options.port, preferredPort)
  const dshAddress = wildcard ? '127.0.0.1' : boundAddress
  const dshPort = wildcard ? await choosePort(dshAddress, undefined) : port
  const hosts = wildcard ? networkHosts() : []
  const primaryHost = hosts[0] ?? dshAddress
  const origins = options.publicUrl
    ? [new URL(options.publicUrl).origin, ...hosts.map(host => httpOrigin(host, port)), httpOrigin('127.0.0.1', port)]
    : wildcard
      ? [...hosts.map(host => httpOrigin(host, port)), httpOrigin('127.0.0.1', port), `http://localhost:${port}`]
      : [httpOrigin(boundAddress, port), ...boundAddress === '127.0.0.1' ? [`http://localhost:${port}`] : []]

  const bundle = bundleDir()
  const profile = installProfile(home, bundle)
  writeProfile(home, profile, 'web', bundle)
  const credential = existing ? undefined : workspaceCredential(home, options.dir)
  const mcpToken = credential?.token
  const log = new Log(join(home, `${profile}.log`))
  let serviceToken = existing?.state.launcherToken ?? randomBytes(24).toString('base64url')
  const started: LaunchedProcess[] = []
  let proxy: Proxy | undefined
  let hostMonitor: ReturnType<typeof setInterval> | undefined
  const stopAll = async () => {
    clearInterval(hostMonitor)
    await proxy?.close()
    proxy = undefined
    for (const launched of started.reverse()) await launched.stop()
    started.length = 0
  }

  try {
    const presmium = options.presmium ?? presmiumBin(env, t.presmiumMissing)
    const server = existing ? undefined : launchWorkspaceServer({
      presmium,
      dir: resolve(options.dir),
      serviceToken,
      mcpToken: mcpToken!,
      port: previewPort,
      args: [
        ...listenAddress ? ['--host', listenAddress] : [],
        ...origins.flatMap(origin => ['--preview-origin', origin]),
        ...options.previewUrl ? ['--public-url', options.previewUrl] : [],
      ],
      env,
      onOutput: text => { log.write('serve', text); options.onServiceOutput?.(text) },
    })
    if (server) started.push(server.process)
    let ready: { url: string, root: string }
    if (existing) ready = { url: existing.state.url, root: existing.root }
    else {
      try { ready = await server!.ready }
      catch (error) {
        // Another local client may win the workspace lease after our initial discovery.
        await server!.process.stop()
        const deadline = Date.now() + 10_000
        while (!existing && Date.now() < deadline) {
          existing = findWorkspaceServiceState(options.dir, env)
          if (!existing) await new Promise(done => setTimeout(done, 100))
        }
        if (!existing || !canReuse()) throw error
        serviceToken = existing.state.launcherToken!
        ready = { url: existing.state.url, root: existing.root }
      }
    }
    const { url, root } = ready
    const tokenFile = existing ? join(serveStateDir(root, env), 'server.json') : credential!.file
    let serverEnded: Promise<unknown>
    if (existing) {
      const ownerPid = existing.state.pid
      const response = await fetch(`${url}/__presmium/presmium.workspace/preview-origins`, {
        method: 'POST', headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ origins }), signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(t.existingService(url))
      // Studio borrows this host. If its owner closes it, end the workbench without stopping or replacing it.
      serverEnded = new Promise<void>(done => {
        hostMonitor = setInterval(() => {
          const current = readServiceState(join(serveStateDir(root, env), 'server.json'))
          if (!current || current.pid !== ownerPid || current.url !== url) { clearInterval(hostMonitor); done() }
        }, 500)
        hostMonitor.unref()
      })
    } else serverEnded = server!.process.exited
    const mcpUrl = new URL(`${(options.previewUrl ?? url).replace(/\/+$/, '')}/mcp`)
    if (!options.previewUrl && listenAddress) mcpUrl.hostname = bracketIPv6(primaryHost)

    const trustedHosts = wildcard
      ? [...hosts, hostname(), `${hostname()}.local`]
      : listenAddress ? [listenAddress] : []
    const dsh = launchNode('DeepSeek Harness', [
      dshBin(PACKAGE_DIR), ...launchArgs(profile, 'web'), '--port', String(dshPort), '--no-open',
      ...wildcard || listenAddress ? ['--host', dshAddress] : [],
      ...trustedHosts.flatMap(host => ['--trusted-host', authority(host, port)]),
      ...options.publicUrl ? ['--public-url', options.publicUrl, '--trusted-host', new URL(options.publicUrl).host] : [],
    ], {
      cwd: root,
      env: {
        ...inheritedEnv(env, name => isLauncherVariable(name) || ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL'].includes(name)),
        ...modelEnv(env).env,
        ...launchEnv(home, env),
        PRESMIUM_COMMAND: presmium,
        PRESMIUM_SERVICE_URL: url,
        PRESMIUM_SERVICE_TOKEN: serviceToken,
        PRESMIUM_WORKSPACE: root,
      },
      onOutput: text => log.write('dsh', text),
    })
    started.push(dsh)
    const backend = (await dsh.ready(WEB_READY))[1]!
    if (portFile) {
      try {
        const content = `${JSON.stringify({ port })}\n`
        if (!existsSync(portFile) || readFileSync(portFile, 'utf8') !== content) {
          mkdirSync(dirname(portFile), { recursive: true, mode: 0o700 })
          writeFileSync(portFile, content, { mode: 0o600 })
        }
      } catch { /* Failure to retain a preferred port must not prevent opening the workspace. */ }
    }
    if (wildcard) proxy = await startProxy({ host: boundAddress, port, target: `http://${authority(dshAddress, dshPort)}` })
    dsh.stopBuffering()
    const address = studioUrl(backend, options.publicUrl, primaryHost, port)
    const networkUrls = hosts.slice(1).map(host => studioUrl(backend, `http://${authority(host, port)}/`, host, port))
    // The address with its launch token, for a host that opens Studio for the user (0600, removed on close).
    const state = join(home, `${profile}.json`)
    writeFileSync(state, `${JSON.stringify({ url: address, workspace: root, workspaceServerUrl: url, pid: process.pid }, null, 2)}\n`, { mode: 0o600 })

    let closing: Promise<void> | undefined
    const ended = Promise.race([
      serverEnded.then(() => t.serviceEnded),
      dsh.exited.then(() => t.appEnded),
    ]).then(how => (closing ? new Promise<string>(() => {}) : how))
    return {
      url: address,
      networkUrls,
      workspaceServerUrl: url,
      mcp: { url: mcpUrl.href, tokenFile, ...movedFrom ? { movedFrom } : {} },
      root,
      home,
      log: log.file,
      ended,
      state,
      close() {
        closing ??= stopAll().finally(() => { rmSync(state, { force: true }); log.close() })
        return closing
      },
    }
  } catch (error) {
    await stopAll()
    log.close()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(t.wholeLog(message, log.file))
  }
}
