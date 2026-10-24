import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { forEachLine } from '@lincyaw/kernel/node'

const exec = promisify(execFile)

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 64 << 20 })
  return stdout.trim()
}

function binPath(dir: string): string {
  const bins: string[] = []
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, 'node_modules', '.bin'))) bins.push(join(d, 'node_modules', '.bin'))
    if (dirname(d) === d) break
  }
  return [...bins, process.env.PATH ?? ''].join(delimiter)
}

/** Runs `command`, its output a line at a time to `log` (else to this process's stderr); `signal` stops it. */
export function run(cwd: string, command: string, args: string[], env: Record<string, string> = {}, options: { log?: (line: string) => void, signal?: AbortSignal } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(options.signal.reason as Error)
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env, PATH: binPath(cwd) }, stdio: options.log ? ['ignore', 'pipe', 'pipe'] : ['ignore', 2, 2] })
    if (options.log) for (const stream of [child.stdout, child.stderr]) forEachLine(stream, options.log)
    const stop = () => child.kill('SIGTERM')
    options.signal?.addEventListener('abort', stop, { once: true })
    child.on('error', error => reject(new Error(`cannot run ${command}: ${error.message}`)))
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', stop)
      if (options.signal?.aborted) reject(options.signal.reason as Error)
      else if (code === 0) resolve()
      else reject(new Error(`${command} ${args[0] ?? ''} exited with code ${code}`))
    })
  })
}
