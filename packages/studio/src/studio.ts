import { randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, isIP } from 'node:net'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bracketIPv6, dshBin, inheritedEnv, isLauncherVariable, launchArgs, launchEnv, launchNode, launchWorkspaceServer, WEB_READY, writeProfile } from '@lincyaw/dsh/launch'
import type { LaunchedProcess } from '@lincyaw/dsh/launch'
import { modelEnv } from './model-env.ts'

const PROFILE = 'presmium-studio'
const DEFAULT_PORT = 4320
const LOG_BYTES = 16 << 20

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

export interface StudioOptions {
  dir: string
  port?: number
  /** `--host`: one address of this machine to listen on instead of 127.0.0.1. */
  listenAddress?: string
  env?: NodeJS.ProcessEnv
  presmium?: string
  /** Live workspace-service output; the complete host output is also kept in `Studio.log`. */
  onServiceOutput?(text: string): void
}

export interface Studio {
  url: string
  workspaceServerUrl: string
  root: string
  home: string
  log: string
  ended: Promise<string>
  close(): Promise<void>
}

function studioHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'studio')
}

/** The `presmium` command of the `@lincyaw/presmium` package this one depends on. */
function presmiumBin(): string {
  return join(dirname(createRequire(join(PACKAGE_DIR, 'package.json')).resolve('@lincyaw/presmium/package.json')), 'bin', 'presmium.mjs')
}

const WILDCARD = /^(?:0\.0\.0\.0|::|(?:0+:){7}0+|::ffff:0\.0\.0\.0)$/i

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

async function choosePort(listenAddress: string, port: number | undefined): Promise<number> {
  if (port) {
    if (await freePort(listenAddress, port) === undefined) throw new Error(`port ${port} of ${listenAddress} is in use: give another with --port`)
    return port
  }
  const chosen = (port === undefined ? await freePort(listenAddress, DEFAULT_PORT) : undefined) ?? await freePort(listenAddress, 0)
  if (chosen === undefined) throw new Error(`no free port on ${listenAddress}`)
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
  const { listenAddress } = options
  if (listenAddress !== undefined && (isIP(listenAddress) === 0 || WILDCARD.test(listenAddress))) {
    throw new Error(`--host takes one address of this machine, such as 192.168.0.21, not "${listenAddress}" (DeepSeek Harness listens on one concrete address, never on all of them)`)
  }
  const port = await choosePort(listenAddress ?? '127.0.0.1', options.port)
  const origins = [`http://${bracketIPv6(listenAddress ?? '127.0.0.1')}:${port}`, ...!listenAddress || listenAddress === '127.0.0.1' ? [`http://localhost:${port}`] : []]

  const home = studioHome(env)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  writeProfile(home, PROFILE, 'web')
  const log = new Log(join(home, 'presmium-studio.log'))
  const serviceToken = randomBytes(24).toString('base64url')
  const started: LaunchedProcess[] = []
  const stopAll = async () => {
    for (const launched of started.reverse()) await launched.stop()
    started.length = 0
  }

  try {
    const server = launchWorkspaceServer({
      presmium: options.presmium ?? presmiumBin(),
      dir: resolve(options.dir),
      serviceToken,
      args: [
        ...listenAddress ? ['--host', listenAddress] : [],
        ...origins.flatMap(origin => ['--preview-origin', origin]),
      ],
      env,
      onOutput: text => { log.write('serve', text); options.onServiceOutput?.(text) },
    })
    started.push(server.process)
    const { url, root } = await server.ready

    const dsh = launchNode('DeepSeek Harness', [
      dshBin(PACKAGE_DIR), ...launchArgs(PROFILE, 'web'), '--port', String(port), '--no-open',
      ...listenAddress ? ['--host', listenAddress, '--trusted-host', `${bracketIPv6(listenAddress)}:${port}`] : [],
    ], {
      cwd: root,
      env: {
        ...inheritedEnv(env, name => isLauncherVariable(name) || ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL'].includes(name)),
        ...modelEnv(env).env,
        ...launchEnv(home, env),
        PRESMIUM_SERVICE_URL: url,
        PRESMIUM_SERVICE_TOKEN: serviceToken,
        PRESMIUM_WORKSPACE: root,
      },
      onOutput: text => log.write('dsh', text),
    })
    started.push(dsh)
    const address = (await dsh.ready(WEB_READY))[1]!
    dsh.stopBuffering()

    let closing: Promise<void> | undefined
    const ended = Promise.race([
      server.process.exited.then(() => 'the workspace service (presmium serve) ended'),
      dsh.exited.then(() => 'DeepSeek Harness ended'),
    ]).then(how => (closing ? new Promise<string>(() => {}) : how))
    return {
      url: address,
      workspaceServerUrl: url,
      root,
      home,
      log: log.file,
      ended,
      close() {
        closing ??= stopAll().finally(() => log.close())
        return closing
      },
    }
  } catch (error) {
    await stopAll()
    log.close()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message.endsWith('\n') ? message : `${message}; `}the whole log is ${log.file}`)
  }
}
