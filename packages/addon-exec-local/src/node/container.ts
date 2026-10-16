/**
 * Container executor (P-22), at compile time (`createContainerExecutor`) and
 * behind the dev-server endpoints (./server.ts). The Dev Containers CLI reads
 * the repository's devcontainer definition and builds its image (image,
 * Dockerfile, features); each run then starts a fresh container from that
 * image, without network, with the workspace mounted read-only where the CLI
 * would mount it and a new directory of the run's own, holding the request's
 * files, mounted read-write as its working directory.
 *
 * A request keeps the meaning of `RunRequest` (as in the browser and the
 * other compile-time executors): Python runs Presmium's runner
 * (`@presmium/kernel/runner.py`, the one the execution plugin runs too),
 * which reads the request from a file of the run's directory, gives the
 * parameters as variables and the request's stdin to the program, and
 * writes the result, with its rich outputs, to a file there; another
 * language's runner command gets the code as its last argument and the
 * parameters as environment variables. Runs do not share a session.
 *
 * Environment (docs/architecture.md 10.6): the `docker` and devcontainer
 * command lines get the run's `RunContext.env` (without one, only `PATH`,
 * `LANG` and a temporary `HOME`) plus what the Docker client needs
 * (`DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_CERT_PATH`,
 * `DOCKER_TLS_VERIFY`, `XDG_RUNTIME_DIR` and the real `HOME`); the code in
 * the container gets the variables of `RunContext.env` but the host's paths
 * (`PATH`, `HOME`, `TMPDIR`).
 *
 * What depends only on the definition (its configuration, runners and hash)
 * is read once per version of it (`definitionStamp`); the CLI's commands and
 * the runs stop at their timeouts, so a stalled image build fails and the
 * next run builds again.
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { errorMessage, languageId } from '@presmium/kernel'
import type { Executor, RunContext, RunOutput, RunRequest, RunResult } from '@presmium/kernel'
import { parse } from 'jsonc-parser'
import { CONTAINER_EXECUTOR_ID, DEFAULT_BUILD_TIMEOUT_MS, failedContainerRun, runnersFrom, workspacePath } from '../domain/index.ts'
import type { Runners } from '../domain/index.ts'
import { text } from './messages.ts'
import { runProcess } from './process.ts'

const require = createRequire(import.meta.url)
const CLI = require.resolve('@devcontainers/cli/devcontainer.js')
const DEFAULT_TIMEOUT_MS = 30_000
const READ_TIMEOUT_MS = 60_000
/** Where a run's own directory is mounted in its container, as the working directory. */
const RUN_DIR = '/presmium-run'
/** The Python runner's input and result in the run's directory. */
const REQUEST_FILE = '.presmium/request.json'
const RESULT_FILE = '.presmium/result-0.json'
const PYTHON_RUNNER = `${readFileSync(require.resolve('@presmium/kernel/runner.py'), 'utf8')}\n_pm_main()\n`
/** What the Docker client reads besides the run's environment; none of them is a credential. */
const DOCKER_CLIENT = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'XDG_RUNTIME_DIR', 'HOME']
/** Paths of the host, which mean nothing in the container. */
const HOST_PATHS = new Set(['PATH', 'HOME', 'TMPDIR'])

/** The environment code gets without a compiler's context: `PATH`, `LANG` and a temporary `HOME`. */
function plainEnv(): Record<string, string> {
  const home = join(tmpdir(), 'presmium-home')
  mkdirSync(home, { recursive: true })
  return { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', HOME: home }
}

/** The environment of the `docker` and devcontainer command lines: the run's, and the Docker client's variables. */
export function dockerEnv(ctx?: RunContext): Record<string, string> {
  const env: Record<string, string> = { ...ctx?.env ?? plainEnv() }
  for (const name of DOCKER_CLIENT) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

export interface Devcontainer {
  /** Absolute path of the devcontainer.json in use. */
  configFile: string
  /** Docker `--mount` value of the workspace (the CLI mounts its git root). */
  workspaceMount: string
  /** The workspace inside the container. */
  workspaceFolder: string
  runners: Runners
  user?: string
  env: Record<string, string>
}

export interface BuildOptions {
  /** How long building the image may take (`presmium.execLocal.buildTimeoutMs`). */
  buildTimeoutMs?: number
}

function devcontainerCli(args: string[], timeoutMs: number, signal?: AbortSignal, env = dockerEnv()) {
  return runProcess(process.execPath, [CLI, ...args], { timeoutMs, signal, env })
}

/** What the CLI's `read-configuration` and `build` commands print. */
interface CliOutput {
  outcome?: string
  message?: string
  description?: string
  configuration?: {
    configFilePath?: { fsPath?: string }
    customizations?: unknown
    remoteUser?: string
    containerUser?: string
    containerEnv?: Record<string, string>
  }
  workspace?: { workspaceFolder?: string, workspaceMount?: string }
}

/** The CLI prints its result as the last JSON line of stdout. */
function lastJson(stdout: string): CliOutput | undefined {
  const line = stdout.trim().split('\n').pop()
  try {
    return line ? JSON.parse(line) : undefined
  }
  catch {
    return undefined
  }
}

/** The workspace's devcontainer.json, found where the CLI looks by default. */
export function findDefinition(workspace: string): string | undefined {
  return ['.devcontainer/devcontainer.json', '.devcontainer.json'].map(file => join(workspace, file)).find(existsSync)
}

/** Changes whenever a file next to devcontainer.json (e.g. its Dockerfile) changes. */
function definitionStamp(configFile: string): string {
  const dir = dirname(configFile)
  return `${configFile}@${Math.max(...readdirSync(dir).map(name => statSync(join(dir, name)).mtimeMs))}`
}

/** `compute` for a definition, computed once per version of it. */
function perVersion<T>(compute: (configFile: string) => T): (configFile: string) => T {
  const values = new Map<string, T>()
  return (configFile) => {
    const stamp = definitionStamp(configFile)
    if (!values.has(stamp)) values.set(stamp, compute(configFile))
    return values.get(stamp)!
  }
}

/**
 * Runners of a devcontainer.json (JSON with comments). Read directly because
 * the CLI's `read-configuration` needs Docker, and exports work without it.
 */
export const definitionRunners = perVersion((configFile): Runners => {
  const config = parse(readFileSync(configFile, 'utf8'), [], { allowTrailingComma: true }) as { customizations?: unknown } | undefined
  return runnersFrom(config?.customizations)
})

/** Changes whenever a file next to devcontainer.json changes content, unlike `definitionStamp`. */
const definitionHash = perVersion((configFile): string => {
  const dir = dirname(configFile)
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isFile()) hash.update(`${name}\0`).update(readFileSync(path)).update('\0')
  }
  return hash.digest('hex')
})

let docker: Promise<boolean> | undefined

/** Whether the Docker daemon answers; a yes is remembered, a no asked again next time. */
export function dockerAvailable(): Promise<boolean> {
  if (!docker) {
    const probe = runProcess('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 10_000, env: dockerEnv() }).then(result => result.code === 0)
    docker = probe
    void probe.then((answers) => {
      if (!answers && docker === probe) docker = undefined
    })
  }
  return docker
}

let dockerSync: boolean | undefined

function dockerAvailableSync(): boolean {
  dockerSync ??= spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 10_000, env: dockerEnv() }).status === 0
  return dockerSync
}

const configurations = new Map<string, Promise<Devcontainer | undefined>>()

/**
 * The resolved definition for running (needs Docker), or undefined when there
 * is none or it cannot be read; read once per version of the definition.
 */
export function readDevcontainer(workspace: string, env?: Record<string, string>): Promise<Devcontainer | undefined> {
  const configFile = findDefinition(workspace)
  if (!configFile) return Promise.resolve(undefined)
  const key = `${workspace}\0${definitionStamp(configFile)}`
  let read = configurations.get(key)
  if (!read) {
    read = readConfiguration(workspace, env)
    configurations.set(key, read)
    // A definition that could not be read (e.g. Docker was not up) is read again next time.
    void read.then(found => found || configurations.delete(key))
  }
  return read
}

async function readConfiguration(workspace: string, env?: Record<string, string>): Promise<Devcontainer | undefined> {
  const result = await devcontainerCli(['read-configuration', '--workspace-folder', workspace], READ_TIMEOUT_MS, undefined, env)
  const output = lastJson(result.stdout)
  const config = output?.configuration
  const configFile = config?.configFilePath?.fsPath
  if (result.code !== 0 || !config || !configFile) return undefined
  const workspaceFolder = output?.workspace?.workspaceFolder ?? `/workspaces/${basename(workspace)}`
  return {
    configFile,
    workspaceMount: output?.workspace?.workspaceMount ?? `type=bind,source=${workspace},target=${workspaceFolder}`,
    workspaceFolder,
    runners: runnersFrom(config.customizations),
    user: config.remoteUser ?? config.containerUser,
    env: { ...config.containerEnv },
  }
}

const images = new Map<string, Promise<string>>()

/** Tag of the image built for a workspace, like the `vsc-<folder>-<hash>` images of VS Code. */
export function imageName(workspace: string): string {
  return `presmium-devcontainer-${createHash('sha256').update(workspace).digest('hex').slice(0, 12)}`
}

/**
 * Builds the devcontainer image once per definition version; Docker caches the
 * layers. A build that fails, times out or is aborted is forgotten, so the
 * next run builds again.
 */
export function devcontainerImage(workspace: string, devcontainer: Devcontainer, options: BuildOptions = {}, signal?: AbortSignal, env?: Record<string, string>): Promise<string> {
  const key = definitionStamp(devcontainer.configFile)
  let image = images.get(key)
  if (!image) {
    const name = imageName(workspace)
    const timeoutMs = options.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS
    image = devcontainerCli(['build', '--workspace-folder', workspace, '--image-name', name], timeoutMs, signal, env).then((result) => {
      if (result.timedOut) throw new Error(`stopped after ${timeoutMs} ms`)
      const output = lastJson(result.stdout)
      if (output?.outcome !== 'success') {
        const detail = [output?.message, output?.description].filter(Boolean).join('\n') || result.stderr.trim().slice(-2000)
        throw new Error(detail)
      }
      return name
    })
    image.catch(() => images.delete(key))
    images.set(key, image)
  }
  return image
}

/** The container executor for compile-time execution (K-19), bound to the deck's workspace by the plugin's pass. */
export interface ContainerExecutor extends Executor {
  bind(workspace: string, options?: BuildOptions): void
}

/**
 * Runs code at compile time in the devcontainer image of the bound workspace
 * (P-22). Its environment fingerprint is the definition's content, so recorded
 * outputs stay valid until the definition changes; without Docker it supports
 * nothing, and the compiler falls back to the recordings. A run that never
 * reaches the program (no Docker, failed image build) throws instead of
 * returning a result, so that the failure is not recorded.
 */
export function createContainerExecutor(id = CONTAINER_EXECUTOR_ID): ContainerExecutor {
  let workspace: string | undefined
  let build: BuildOptions = {}
  const definition = () => (workspace === undefined ? undefined : findDefinition(workspace))
  const runner = (configFile: string, lang: string) => definitionRunners(configFile)[languageId(lang)]
  return {
    id,
    bind(dir, options = {}) {
      workspace = dir
      build = options
    },
    supports(lang) {
      const configFile = definition()
      return configFile !== undefined && runner(configFile, lang) !== undefined && dockerAvailableSync()
    },
    fingerprint(lang) {
      const configFile = definition()
      return configFile ? `${definitionHash(configFile)}:${JSON.stringify(runner(configFile, lang) ?? null)}` : ''
    },
    async run(request, signal, ctx) {
      const dir = workspace
      if (dir === undefined || !definition()) throw new Error('the workspace has no devcontainer definition')
      if (!await dockerAvailable()) throw new Error('Docker is not available')
      const devcontainer = await readDevcontainer(dir, dockerEnv(ctx))
      if (!devcontainer) throw new Error('cannot read the devcontainer definition')
      const result = await runInContainer(dir, devcontainer, request, build, signal, ctx, id)
      if (result.exitCode === null && !result.timedOut) throw new Error(result.stderr)
      return result
    },
  }
}

/** A new directory for one run, writable by the container's user whatever its uid, holding the request's files. */
function runDirectory(files: Record<string, string> | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-container-'))
  chmodSync(dir, 0o777)
  mkdirSync(join(dir, '.presmium'), { mode: 0o777 })
  chmodSync(join(dir, '.presmium'), 0o777)
  for (const [name, content] of Object.entries(files ?? {})) {
    const file = join(dir, workspacePath(name))
    mkdirSync(dirname(file), { recursive: true, mode: 0o777 })
    writeFileSync(file, content, { mode: 0o666 })
  }
  return dir
}

/** The Python runner's result, when it got to write it. */
function pythonResult(dir: string): { stdout: string, stderr: string, exitCode: number, outputs?: RunOutput[] } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, RESULT_FILE), 'utf8'))
  }
  catch {
    return undefined
  }
}

/** Runs a request in a fresh container (see the top of this file). */
export async function runInContainer(workspace: string, devcontainer: Devcontainer, request: RunRequest, build: BuildOptions = {}, signal?: AbortSignal, ctx?: RunContext, executorId = CONTAINER_EXECUTOR_ID): Promise<RunResult> {
  const lang = languageId(request.lang)
  const runner = devcontainer.runners[lang]
  if (!runner) return { ...failedContainerRun(text().unsupportedLanguage(request.lang)), executorId }
  const commandEnv = dockerEnv(ctx)
  let image: string
  try {
    image = await devcontainerImage(workspace, devcontainer, build, signal, commandEnv)
  }
  catch (error) {
    return { ...failedContainerRun(text().buildFailed(errorMessage(error))), executorId }
  }
  let dir: string
  try {
    dir = runDirectory(request.files)
  }
  catch (error) {
    return { ...failedContainerRun(errorMessage(error)), executorId }
  }
  const python = lang === 'python'
  const started = Date.now()
  const name = `presmium-run-${randomUUID()}`
  // The code gets the run's variables, but the host's paths; then the definition's own and, outside Python, the parameters.
  const passed = Object.fromEntries(Object.entries(ctx?.env ?? {}).filter(([key]) => !HOST_PATHS.has(key)))
  const env = { ...passed, ...devcontainer.env, ...python ? {} : request.args }
  if (python) {
    const input = { runs: [{ code: request.code, args: request.args ?? {}, stdin: request.stdin ?? '' }], path: [devcontainer.workspaceFolder] }
    writeFileSync(join(dir, REQUEST_FILE), JSON.stringify(input), { mode: 0o666 })
  }
  try {
    const result = await runProcess('docker', [
      'run', '--rm', '-i', '--init', '--network', 'none', '--name', name,
      '--mount', `${devcontainer.workspaceMount},readonly`,
      '--mount', `type=bind,source=${dir},target=${RUN_DIR}`,
      '--workdir', RUN_DIR,
      ...(devcontainer.user ? ['--user', devcontainer.user] : []),
      ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
      image,
      ...runner,
      python ? PYTHON_RUNNER : request.code,
    ], {
      input: python ? '' : request.stdin,
      env: commandEnv,
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal,
      onStop: () => void runProcess('docker', ['kill', name], { env: commandEnv }),
    })
    const output = python && !result.timedOut ? pythonResult(dir) : undefined
    const exitCode = result.timedOut ? null : output ? output.exitCode : result.code
    return {
      ok: exitCode === 0,
      stdout: output ? output.stdout : result.stdout,
      stderr: output ? output.stderr : result.stderr,
      exitCode,
      durationMs: Date.now() - started,
      timedOut: result.timedOut,
      source: 'live',
      executorId,
      ...output?.outputs ? { outputs: output.outputs } : {},
    }
  }
  finally {
    // Files the container's user made may not be the host user's to remove.
    try {
      rmSync(dir, { recursive: true, force: true })
    }
    catch {}
  }
}
