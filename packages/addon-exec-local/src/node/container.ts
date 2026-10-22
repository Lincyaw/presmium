import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { errorMessage, languageId } from '@lincyaw/kernel'
import type { Executor, RunContext, RunOutput, RunRequest, RunResult } from '@lincyaw/kernel'
import { RUN_REQUEST_FILE, runResultFile } from '@lincyaw/kernel/node'
import { CONTAINER_EXECUTOR_ID, failedContainerRun, workspacePath } from '../domain/index.ts'
import type { BuildOptions, Devcontainer } from './devcontainer.ts'
import { definitionCommands, definitionHash, devcontainerImage, findDefinition, readDevcontainer } from './devcontainer.ts'
import { dockerAvailable, dockerEnv, isDockerAvailableSync } from './docker.ts'
import { text } from './messages.ts'
import { runProcess } from './process.ts'

const DEFAULT_TIMEOUT_MS = 30_000
const RUN_DIR = '/presmium-run'
const PYTHON_RUNNER = `${readFileSync(createRequire(import.meta.url).resolve('@lincyaw/kernel/runner.py'), 'utf8')}\n_pm_main()\n`
const HOST_PATHS = new Set(['PATH', 'HOME', 'TMPDIR'])

export interface ContainerExecutor extends Executor {
  bind(workspace: string, options?: BuildOptions): void
}

/** Runs code in a new container of the image of the bound workspace's devcontainer definition. */
export function createContainerExecutor(id = CONTAINER_EXECUTOR_ID): ContainerExecutor {
  let workspace: string | undefined
  let build: BuildOptions = {}
  const definition = () => (workspace === undefined ? undefined : findDefinition(workspace))
  const command = (configFile: string, lang: string) => definitionCommands(configFile)[languageId(lang)]
  return {
    id,
    bind(dir, options = {}) {
      workspace = dir
      build = options
    },
    supports(lang) {
      const configFile = definition()
      return configFile !== undefined && command(configFile, lang) !== undefined && isDockerAvailableSync()
    },
    fingerprint(lang) {
      const configFile = definition()
      return configFile ? `${definitionHash(configFile)}:${JSON.stringify(command(configFile, lang) ?? null)}` : ''
    },
    async run(request, signal, ctx) {
      const dir = workspace
      if (dir === undefined || !definition()) throw new Error('the workspace has no devcontainer definition')
      if (!await dockerAvailable()) throw new Error('Docker is not available')
      const devcontainer = await readDevcontainer(dir, dockerEnv(ctx))
      if (!devcontainer) throw new Error('cannot read the devcontainer definition')
      const result = await runInContainer({ workspace: dir, devcontainer, request, build, signal, ctx, executorId: id })
      if (result.exitCode === null && !result.timedOut) throw new Error(result.stderr)
      return result
    },
  }
}

function runDirectory(files: Record<string, string> | undefined, runnerRequest?: unknown): { parent: string, dir: string } {
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
    if (runnerRequest !== undefined) writeFileSync(join(dir, RUN_REQUEST_FILE), JSON.stringify(runnerRequest), { mode: 0o666, flag: 'wx' })
  } catch (error) {
    rmSync(parent, { recursive: true, force: true })
    throw error
  }
  return { parent, dir }
}

function pythonResult(dir: string): { stdout: string, stderr: string, exitCode: number, outputs?: RunOutput[] } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, runResultFile(0)), 'utf8'))
  }
  catch {
    return undefined
  }
}

export interface ContainerRun {
  workspace: string
  devcontainer: Devcontainer
  request: RunRequest
  build?: BuildOptions
  signal?: AbortSignal
  ctx?: RunContext
  executorId?: string
}

/** Runs the request with `docker run` in a new container of the definition's image, without network; the workspace is mounted read-only. */
export async function runInContainer(run: ContainerRun): Promise<RunResult> {
  const { workspace, devcontainer, request, signal, ctx, executorId = CONTAINER_EXECUTOR_ID } = run
  const lang = languageId(request.lang)
  const command = devcontainer.commands[lang]
  if (!command) return failedContainerRun(text().unsupportedLanguage(request.lang), executorId)
  const commandEnv = dockerEnv(ctx)
  let image: string
  try {
    image = await devcontainerImage(workspace, devcontainer, run.build, signal, commandEnv)
  }
  catch (error) {
    return failedContainerRun(text().buildFailed(errorMessage(error)), executorId)
  }
  const python = lang === 'python'
  let directory: { parent: string, dir: string }
  try {
    directory = runDirectory(request.files, python ? { runs: [{ code: request.code, args: request.args ?? {}, stdin: request.stdin ?? '' }], path: [devcontainer.workspaceFolder] } : undefined)
  }
  catch (error) {
    return failedContainerRun(errorMessage(error), executorId)
  }
  const { parent, dir } = directory
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
      ...command,
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
