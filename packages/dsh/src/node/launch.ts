import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { machineState, NODE_RESOURCE_ARGS, nodeResourceArgs, resourceEnvironment } from '@lincyaw/kernel/node'
export { bracketIPv6, systemLocale } from '@lincyaw/kernel/node'

export type Carrier = 'web' | 'headless' | 'acp'

const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
const PACKAGE_NAME = '@lincyaw/dsh'
const WATCHDOG = join(PACKAGE_DIR, 'src', 'node', 'watchdog.mjs')
const READY_MS = 180_000
const STOP_MS = 15_000

const CARRIERS: Record<Carrier, string> = {
  web: '@deepseek-ai/dsh-web-app',
  headless: '@deepseek-ai/dsh-headless',
  acp: '@deepseek-ai/dsh-acp-app',
}

export function launchPatches(carrier: Carrier): string[] {
  return [...carrier === 'web' ? [join(PACKAGE_DIR, 'web.patch.yml')] : [], join(PACKAGE_DIR, 'profile.patch.yml')]
}

export function launchArgs(name: string, carrier: Carrier): string[] {
  return ['--profile', name, ...launchPatches(carrier).flatMap(file => ['--patch', file])]
}

export const WEB_READY = /^dsh web: (https?:\/\/\S+)$/m
/** The two lines `presmium serve` prints when it is ready: its address and the workspace root. */
export const SERVE_READY = /^serve {2}(http\S+)$/m
export const WORKSPACE_READY = /^workspace {2}(.+)$/m

export function dshBin(from = PACKAGE_DIR): string {
  const manifest = createRequire(join(from, 'package.json')).resolve('@deepseek-ai/dsh/package.json')
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin.dsh!)
}

export function launchEnv(dshHome: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return resourceEnvironment({ DSH_HOME: dshHome, DSH_AGENTS_HOME: join(dshHome, 'agents'), DSH_TELEMETRY_MODE: 'DISABLED', PRESMIUM_MAX_THREADS: env.PRESMIUM_MAX_THREADS }, 'interactive')
}

/** The variables a launcher sets for the processes it starts; they are never inherited from its own environment. */
export function isLauncherVariable(name: string): boolean {
  return /^(?:DSH_|PRESMIUM_MODEL_|PRESMIUM_SERVICE_)/.test(name) || ['PRESMIUM_WORKSPACE', 'NODE_ENV', 'PORT'].includes(name)
}

export function inheritedEnv(env: NodeJS.ProcessEnv, drop: (name: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drop(entry[0])))
}

/** The environment of the workspace server: the launcher's, without the variables of DeepSeek Harness, of its model and of the launcher, with the service token. */
export function workspaceServerEnv(env: NodeJS.ProcessEnv, serviceToken: string): Record<string, string> {
  return { ...inheritedEnv(env, name => isLauncherVariable(name) || name.startsWith('DEEPSEEK_')), PRESMIUM_SERVICE_TOKEN: serviceToken }
}

export interface LaunchedProcess {
  child: ChildProcess
  /** The first match of `pattern` in the output, once it is printed; rejects when the process ends first or takes over 3 minutes. */
  ready(pattern: RegExp): Promise<RegExpExecArray>
  /** Stops keeping the output for `ready`, once the process is ready. */
  stopBuffering(): void
  exited: Promise<void>
  /** SIGTERM, then SIGKILL to the whole process group after 15 s. */
  stop(): Promise<void>
}

/**
 * Starts `node <args>` under the watchdog, in a process group of its own, with the interactive thread budget at normal
 * priority: the author waits for the workspace service and DeepSeek Harness. The watchdog ends the group when the
 * launcher's pipe to it closes, so the group ends with the launcher, after `kill -9` too.
 */
export function launchNode(name: string, args: string[], options: { cwd: string, env: Record<string, string>, onOutput?(text: string): void }): LaunchedProcess {
  const machine = machineState()
  const node = nodeResourceArgs('interactive', options.env, machine)
  const child = spawn(process.execPath, [...NODE_RESOURCE_ARGS, WATCHDOG, process.execPath, ...node, ...args], { cwd: options.cwd, env: resourceEnvironment(options.env, 'interactive', machine), detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin!.on('error', () => {})
  let output: string | undefined = ''
  const waiting = new Set<() => void>()
  const read = (chunk: Buffer) => {
    const text = chunk.toString()
    options.onOutput?.(text)
    if (output === undefined) return
    output = (output + text).slice(-20_000)
    for (const check of waiting) check()
  }
  child.stdout!.on('data', read)
  child.stderr!.on('data', read)
  let ended = false
  const exited = new Promise<void>(done => child.once('exit', () => {
    ended = true
    done()
  }))
  return {
    child,
    exited,
    ready(pattern) {
      return new Promise((resolveReady, reject) => {
        const tail = () => (output ?? '').trimEnd().split('\n').slice(-12).map(line => `  ${line}`).join('\n')
        const timer = setTimeout(() => finish(new Error(`${name} did not start within ${READY_MS / 1000} s:\n${tail()}\n`)), READY_MS)
        const check = () => {
          const match = pattern.exec(output ?? '')
          if (match) finish(match)
        }
        const finish = (result: RegExpExecArray | Error) => {
          clearTimeout(timer)
          waiting.delete(check)
          if (result instanceof Error) reject(result)
          else resolveReady(result)
        }
        waiting.add(check)
        void exited.then(() => finish(new Error(`${name} ended before it was ready:\n${tail()}\n`)))
        check()
      })
    },
    stopBuffering() {
      output = undefined
    },
    async stop() {
      if (ended) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL')
        } catch {
        }
      }, STOP_MS)
      await exited
      clearTimeout(timer)
    },
  }
}

export interface LaunchedWorkspaceServer {
  process: LaunchedProcess
  /** The server's address and the workspace root, once `presmium serve` printed them. */
  ready: Promise<{ url: string, root: string }>
}

/** Starts `presmium serve <dir> --port <port, default 0: a free one> [args]` with `launchNode`, in `workspaceServerEnv`. */
export function launchWorkspaceServer(options: { presmium: string, dir: string, serviceToken: string, port?: number, args?: string[], env?: NodeJS.ProcessEnv, onOutput?(text: string): void }): LaunchedWorkspaceServer {
  const server = launchNode('presmium serve', [options.presmium, 'serve', options.dir, '--port', String(options.port ?? 0), ...options.args ?? []], {
    cwd: options.dir,
    env: workspaceServerEnv(options.env ?? process.env, options.serviceToken),
    ...options.onOutput ? { onOutput: options.onOutput } : {},
  })
  const ready = (async () => {
    const url = (await server.ready(SERVE_READY))[1]!
    const root = (await server.ready(WORKSPACE_READY))[1]!.trim()
    server.stopBuffering()
    return { url, root }
  })()
  return { process: server, ready }
}

export function writeProfile(dshHome: string, name: string, carrier: Carrier, bundle = PACKAGE_DIR): string {
  const dir = join(dshHome, 'profiles', name)
  mkdirSync(join(dir, 'node_modules', '@lincyaw'), { recursive: true })
  mkdirSync(join(dshHome, 'agents'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', CARRIERS[carrier], PACKAGE_NAME] } },
  }, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.yml'), '# The profile root: an empty entry list; the tree is composed from the bundles and the patches.\n[]\n')
  if (!existsSync(join(dir, 'cordis.patch.yml'))) writeFileSync(join(dir, 'cordis.patch.yml'), '# Your patch layer for this profile (Presmium\'s settings are passed with --patch after it).\n[]\n')
  const link = join(dir, 'node_modules', PACKAGE_NAME)
  rmSync(link, { force: true, recursive: true })
  symlinkSync(realpathSync(bundle), link, 'junction')
  return dir
}
