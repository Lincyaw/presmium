import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { parse } from 'jsonc-parser'
import { DEFAULT_BUILD_TIMEOUT_MS, languageCommandsFrom } from '../domain/index.ts'
import type { LanguageCommands } from '../domain/index.ts'
import { dockerEnv } from './docker.ts'
import { runProcess } from './process.ts'

const CLI = createRequire(import.meta.url).resolve('@devcontainers/cli/devcontainer.js')
const READ_TIMEOUT_MS = 60_000

export interface Devcontainer {
  configFile: string
  workspaceMount: string
  workspaceFolder: string
  commands: LanguageCommands
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

/** The language commands of the devcontainer definition, read again when a file of its directory changes. */
export const definitionCommands = perVersion((configFile): LanguageCommands => {
  const config = parse(readFileSync(configFile, 'utf8'), [], { allowTrailingComma: true }) as { customizations?: unknown } | undefined
  return languageCommandsFrom(config?.customizations)
})

export const definitionHash = perVersion((configFile): string => {
  const dir = dirname(configFile)
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isFile()) hash.update(`${name}\0`).update(readFileSync(path)).update('\0')
  }
  return hash.digest('hex')
})

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
    commands: languageCommandsFrom(config.customizations),
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
