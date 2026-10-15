/**
 * Container executor (P-22), at compile time (`createContainerExecutor`) and
 * behind the dev-server endpoints (./server.ts). The Dev Containers CLI reads
 * the repository's devcontainer definition and builds its image (image,
 * Dockerfile, features); each run then starts a fresh container from that
 * image, with the workspace mounted read-only where the CLI would mount it,
 * and without network.
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import type { Executor, RunRequest, RunResult } from '@presmium/kernel/contracts'
import { parse } from 'jsonc-parser'
import { CONTAINER_EXECUTOR_ID, failedRun, languageId, runnersFrom } from '../domain/index.ts'
import type { Runners } from '../domain/index.ts'
import { runProcess } from './process.ts'

const CLI = createRequire(import.meta.url).resolve('@devcontainers/cli/devcontainer.js')
const DEFAULT_TIMEOUT_MS = 30_000

export interface Devcontainer {
  /** Absolute path of the devcontainer.json in use. */
  configFile: string
  /** Docker `--mount` value of the workspace (the CLI mounts its git root). */
  workspaceMount: string
  /** The workspace inside the container; programs start here. */
  workspaceFolder: string
  runners: Runners
  user?: string
  env: Record<string, string>
}

function devcontainerCli(args: string[]) {
  return runProcess(process.execPath, [CLI, ...args])
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

/**
 * Runners of a devcontainer.json (JSON with comments). Read directly because
 * the CLI's `read-configuration` needs Docker, and exports work without it.
 */
export function definitionRunners(configFile: string): Runners {
  const config = parse(readFileSync(configFile, 'utf8'), [], { allowTrailingComma: true }) as { customizations?: unknown } | undefined
  return runnersFrom(config?.customizations)
}

export async function dockerAvailable(): Promise<boolean> {
  const result = await runProcess('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 10_000 })
  return result.code === 0
}

/** The resolved definition for running (needs Docker), or undefined when there is none. */
export async function readDevcontainer(workspace: string): Promise<Devcontainer | undefined> {
  const result = await devcontainerCli(['read-configuration', '--workspace-folder', workspace])
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

/** Changes whenever a file next to devcontainer.json (e.g. its Dockerfile) changes. */
function definitionStamp(configFile: string): number {
  const dir = dirname(configFile)
  return Math.max(...readdirSync(dir).map(name => statSync(join(dir, name)).mtimeMs))
}

/** Tag of the image built for a workspace, like the `vsc-<folder>-<hash>` images of VS Code. */
export function imageName(workspace: string): string {
  return `presmium-devcontainer-${createHash('sha256').update(workspace).digest('hex').slice(0, 12)}`
}

/** Builds the devcontainer image once per definition version; Docker caches the layers. */
export function devcontainerImage(workspace: string, devcontainer: Devcontainer): Promise<string> {
  const key = `${devcontainer.configFile}@${definitionStamp(devcontainer.configFile)}`
  let image = images.get(key)
  if (!image) {
    const name = imageName(workspace)
    image = devcontainerCli(['build', '--workspace-folder', workspace, '--image-name', name]).then((result) => {
      const output = lastJson(result.stdout)
      if (output?.outcome !== 'success') {
        const detail = [output?.message, output?.description].filter(Boolean).join('\n') || result.stderr.trim().slice(-2000)
        throw new Error(`devcontainer build 失败：${detail}`)
      }
      return name
    })
    image.catch(() => images.delete(key))
    images.set(key, image)
  }
  return image
}

/** Changes whenever a file next to devcontainer.json changes content, unlike `definitionStamp`. */
function definitionHash(configFile: string): string {
  const dir = dirname(configFile)
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isFile()) hash.update(`${name}\0`).update(readFileSync(path)).update('\0')
  }
  return hash.digest('hex')
}

let docker: boolean | undefined

function dockerAvailableSync(): boolean {
  docker ??= spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 10_000 }).status === 0
  return docker
}

/** The container executor for compile-time execution (K-19), bound to the deck's workspace by the plugin's pass. */
export interface ContainerExecutor extends Executor {
  bind(workspace: string): void
}

/**
 * Runs code at compile time in the devcontainer image of the bound workspace
 * (P-22). Its environment fingerprint is the definition's content, so recorded
 * outputs stay valid until the definition changes; without Docker it supports
 * nothing, and the compiler falls back to the recordings. A run that never
 * reaches the program (no Docker, failed image build) throws instead of
 * returning a result, so that the failure is not recorded.
 */
export function createContainerExecutor(): ContainerExecutor {
  let workspace: string | undefined
  const definition = () => (workspace === undefined ? undefined : findDefinition(workspace))
  const runner = (configFile: string, lang: string) => definitionRunners(configFile)[languageId(lang)]
  return {
    id: CONTAINER_EXECUTOR_ID,
    bind(dir) {
      workspace = dir
    },
    supports(lang) {
      const configFile = definition()
      return configFile !== undefined && runner(configFile, lang) !== undefined && dockerAvailableSync()
    },
    fingerprint(lang) {
      const configFile = definition()
      return configFile ? `${definitionHash(configFile)}:${JSON.stringify(runner(configFile, lang) ?? null)}` : ''
    },
    async run(request, signal) {
      const dir = workspace
      if (dir === undefined || !definition()) throw new Error('the workspace has no devcontainer definition')
      if (!await dockerAvailable()) throw new Error('Docker is not available')
      const devcontainer = await readDevcontainer(dir)
      if (!devcontainer) throw new Error('cannot read the devcontainer definition')
      const result = await runInContainer(dir, devcontainer, request, signal)
      if (result.exitCode === null && !result.timedOut) throw new Error(result.stderr)
      return result
    },
  }
}

/** Runs the code in a fresh container: the runner command gets the code as its last argument. */
export async function runInContainer(workspace: string, devcontainer: Devcontainer, request: RunRequest, signal?: AbortSignal): Promise<RunResult> {
  const runner = devcontainer.runners[languageId(request.lang)]
  if (!runner) return failedRun(`容器执行器不支持语言 ${request.lang}`)
  let image: string
  try {
    image = await devcontainerImage(workspace, devcontainer)
  }
  catch (error) {
    return failedRun(error instanceof Error ? error.message : String(error))
  }
  const started = Date.now()
  const name = `presmium-run-${randomUUID()}`
  const env = { ...devcontainer.env, ...request.args }
  const result = await runProcess('docker', [
    'run', '--rm', '-i', '--init', '--network', 'none', '--name', name,
    '--mount', `${devcontainer.workspaceMount},readonly`,
    '--workdir', devcontainer.workspaceFolder,
    ...(devcontainer.user ? ['--user', devcontainer.user] : []),
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    image,
    ...runner,
    request.code,
  ], {
    input: request.stdin,
    timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    signal,
    onStop: () => void runProcess('docker', ['kill', name]),
  })
  return {
    ok: result.code === 0 && !result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.timedOut ? null : result.code,
    durationMs: Date.now() - started,
    timedOut: result.timedOut,
    source: 'live',
    executorId: CONTAINER_EXECUTOR_ID,
  }
}
