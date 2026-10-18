/**
 * For the integration tests of every package (docs/wbs.md, test principles):
 * the real `presmium` CLI in a child process, run as an author runs it, and a
 * scripted Messages-compatible model service (`fakeModel`) that the real
 * DeepSeek Harness talks to in place of a model (docs/design-dsh.md section 15).
 */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** The `presmium` command of this package. */
export const PRESMIUM_BIN = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))

export interface Run {
  /** Exit code; -1 when the process ended without one (a signal, or too much output). */
  code: number
  stdout: string
  stderr: string
}

/** Runs a command and resolves with its exit code and output, whatever the code. */
export function run(command: string, args: string[], options: { cwd?: string, env?: NodeJS.ProcessEnv } = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd, env: options.env, maxBuffer: 256 << 20 }, (error, stdout, stderr) => {
      resolve({ code: !error ? 0 : typeof error.code === 'number' ? error.code : -1, stdout, stderr })
    })
  })
}

/**
 * `presmium <args>` in `cwd`. Vitest sets NODE_ENV=test, under which Vue
 * builds name their source files and Vite builds differ from an author's, so
 * it is removed; `env` adds or replaces variables.
 */
export function presmium(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  const { NODE_ENV: _test, ...inherited } = process.env
  return run(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env: { ...inherited, ...env } })
}

export { fakeModel, recordingProxy } from './fake-model.ts'
export type { FakeModel, Received, Step } from './fake-model.ts'
