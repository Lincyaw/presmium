import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { errorMessage, languageId } from '@lincyaw/kernel'
import type { Executor, RunContext, RunOutput, RunRequest, RunResult } from '@lincyaw/kernel'
import { parse } from 'jsonc-parser'
import { CONTAINER_EXECUTOR_ID, DEFAULT_BUILD_TIMEOUT_MS, failedContainerRun, runnersFrom, workspacePath } from '../domain/index.ts'
import type { Runners } from '../domain/index.ts'
import { text } from './messages.ts'
import { runProcess } from './process.ts'

const require = createRequire(import.meta.url)
const CLI = require.resolve('@devcontainers/cli/devcontainer.js')
const DEFAULT_TIMEOUT_MS = 30_000
const READ_TIMEOUT_MS = 60_000
const RUN_DIR = '/presmium-run'
const REQUEST_FILE = '.presmium/request.json'
const RESULT_FILE = '.presmium/result-0.json'
const PYTHON_RUNNER = `${readFileSync(require.resolve('@lincyaw/kernel/runner.py'), 'utf8')}\n_pm_main()\n`
const DOCKER_CLIENT = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'XDG_RUNTIME_DIR', 'HOME']
const HOST_PATHS = new Set(['PATH', 'HOME', 'TMPDIR'])

function plainEnv(): Record<string, string> {
  const home = join(tmpdir(), 'presmium-home')
  mkdirSync(home, { recursive: true })
  return { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', HOME: home }
}

export function dockerEnv(ctx?: RunContext): Record<string, string> {
  const env: Record<string, string> = { ...ctx?.env ?? plainEnv() }
  for (const name of DOCKER_CLIENT) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

export interface Devcontainer {
  configFile: string
  workspaceMount: string
  workspaceFolder: string
  runners: Runners
  user?: string
  env: Record<string, string>
}

export interface BuildOptions {
  buildTimeoutMs?: number
}

function devcontainerCli(args: string[], timeoutMs: number, signal?: AbortSignal, env = dockerEnv()) {
  return runProcess(process.execPath, [CLI, ...args], { timeoutMs, signal, env })
}

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

function lastJson(stdout: string): CliOutput | undefined {
  const line = stdout.trim().split('\n').pop()
  try {
    return line ? JSON.parse(line) : undefined
  }
  catch {
    return undefined
  }
}

export function findDefinition(workspace: string): string | undefined {
  return ['.devcontainer/devcontainer.json', '.devcontainer.json'].map(file => join(workspace, file)).find(existsSync)
}

function definitionStamp(configFile: string): string {
  const dir = dirname(configFile)
  return `${configFile}@${Math.max(...readdirSync(dir).map(name => statSync(join(dir, name)).mtimeMs))}`
}

function perVersion<T>(compute: (configFile: string) => T): (configFile: string) => T {
  const values = new Map<string, T>()
  return (configFile) => {
    const stamp = definitionStamp(configFile)
    if (!values.has(stamp)) values.set(stamp, compute(configFile))
    return values.get(stamp)!
  }
}

export const definitionRunners = perVersion((configFile): Runners => {
  const config = parse(readFileSync(configFile, 'utf8'), [], { allowTrailingComma: true }) as { customizations?: unknown } | undefined
  return runnersFrom(config?.customizations)
})

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

export function readDevcontainer(workspace: string, env?: Record<string, string>): Promise<Devcontainer | undefined> {
  const configFile = findDefinition(workspace)
  if (!configFile) return Promise.resolve(undefined)
  const key = `${workspace}\0${definitionStamp(configFile)}`
  let read = configurations.get(key)
  if (!read) {
    read = readConfiguration(workspace, env)
    configurations.set(key, read)
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

export function imageName(workspace: string): string {
  return `presmium-devcontainer-${createHash('sha256').update(workspace).digest('hex').slice(0, 12)}`
}

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

export interface ContainerExecutor extends Executor {
  bind(workspace: string, options?: BuildOptions): void
}

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

function runDirectory(files: Record<string, string> | undefined, runner?: unknown): { parent: string, dir: string } {
  const parent = mkdtempSync(join(tmpdir(), 'presmium-container-'))
  chmodSync(parent, 0o700)
  const dir = join(parent, 'run')
  try {
    mkdirSync(join(dir, '.presmium'), { recursive: true })
    chmodSync(dir, 0o777)
    chmodSync(join(dir, '.presmium'), 0o777)
    for (const [name, content] of Object.entries(files ?? {})) {
      const file = join(dir, workspacePath(name))
      mkdirSync(dirname(file), { recursive: true, mode: 0o777 })
      writeFileSync(file, content, { mode: 0o666, flag: 'wx' })
    }
    if (runner !== undefined) writeFileSync(join(dir, REQUEST_FILE), JSON.stringify(runner), { mode: 0o666, flag: 'wx' })
  } catch (error) {
    rmSync(parent, { recursive: true, force: true })
    throw error
  }
  return { parent, dir }
}

function pythonResult(dir: string): { stdout: string, stderr: string, exitCode: number, outputs?: RunOutput[] } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, RESULT_FILE), 'utf8'))
  }
  catch {
    return undefined
  }
}

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
  const python = lang === 'python'
  let run: { parent: string, dir: string }
  try {
    run = runDirectory(request.files, python ? { runs: [{ code: request.code, args: request.args ?? {}, stdin: request.stdin ?? '' }], path: [devcontainer.workspaceFolder] } : undefined)
  }
  catch (error) {
    return { ...failedContainerRun(errorMessage(error)), executorId }
  }
  const { parent, dir } = run
  const started = Date.now()
  const name = `presmium-run-${randomUUID()}`
  const passed = Object.fromEntries(Object.entries(ctx?.env ?? {}).filter(([key]) => !HOST_PATHS.has(key)))
  const env = { ...passed, ...devcontainer.env, ...python ? {} : request.args }
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
    try {
      rmSync(parent, { recursive: true, force: true })
    }
    catch {}
  }
}
