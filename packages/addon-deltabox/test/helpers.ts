import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probe } from '../src/node/client.ts'
import { messages } from '../src/node/messages.ts'

const PRESMIUM_BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
export const ADDON_EXEC = fileURLToPath(new URL('../../addon-exec', import.meta.url))
export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

export function qualification(): { ok: boolean, why: string } {
  const state = mkdtempSync(join(tmpdir(), 'presmium-deltabox-probe-'))
  try {
    const found = probe(state)
    return found.ok ? { ok: true, why: '' } : { ok: false, why: `${messages('en').unqualified(found)}. ${messages('en').enable}` }
  } finally {
    rmSync(state, { recursive: true, force: true })
  }
}

export function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const { NODE_ENV: _test, ...inherited } = process.env
  return { ...inherited, ...extra }
}

export interface Result { code: number, stdout: string, stderr: string }

export function presmium(args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }): Promise<Result> {
  return new Promise((resolve) => {
    execFile(process.execPath, [PRESMIUM_BIN, ...args], { cwd: options.cwd, env: options.env, maxBuffer: 64 << 20 }, (error, stdout, stderr) => {
      resolve({ code: !error ? 0 : typeof error.code === 'number' ? error.code : -1, stdout, stderr })
    })
  })
}

export interface Running {
  child: ChildProcess
  output(): string
  wait(pattern: RegExp, timeoutMs?: number): Promise<RegExpExecArray>
  stop(): Promise<void>
}

export function presmiumProcess(args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }): Running {
  const child = spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const exited = new Promise(done => child.once('exit', done))
  return {
    child,
    output: () => output,
    wait(pattern, timeoutMs = 60_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}:\n${output}`)), timeoutMs)
        const check = () => {
          const match = pattern.exec(output)
          if (!match) return
          clearTimeout(timer)
          resolve(match)
        }
        child.stdout.on('data', check)
        child.stderr.on('data', check)
        child.once('exit', () => {
          clearTimeout(timer)
          const match = pattern.exec(output)
          if (match) resolve(match)
          else reject(new Error(`exited:\n${output}`))
        })
        check()
      })
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await exited
      }
    },
  }
}

export function processTree(pid: number): number[] {
  const parents = new Map<number, number>()
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      parents.set(Number(name), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]))
    } catch {}
  }
  const below = (parent: number): number[] => [...parents].filter(([, ppid]) => ppid === parent).flatMap(([child]) => [...below(child), child])
  return [...below(pid), pid]
}
