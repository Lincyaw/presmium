import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'

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

export function run(cwd: string, command: string, args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env, PATH: binPath(cwd) }, stdio: ['ignore', 2, 2] })
    child.on('error', error => reject(new Error(`cannot run ${command}: ${error.message}`)))
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ''} exited with code ${code}`)))
  })
}
