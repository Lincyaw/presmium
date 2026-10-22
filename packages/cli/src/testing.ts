import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const PRESMIUM_BIN = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))

export interface Run {
  code: number
  stdout: string
  stderr: string
}

export function run(command: string, args: string[], options: { cwd?: string, env?: NodeJS.ProcessEnv } = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, env: options.env, maxBuffer: 256 << 20 }, (error, stdout, stderr) => {
      resolve({ code: !error ? 0 : typeof error.code === 'number' ? error.code : -1, stdout, stderr })
    })
  })
}

export function presmium(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  const { NODE_ENV: _test, ...inherited } = process.env
  return run(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env: { ...inherited, ...env } })
}

