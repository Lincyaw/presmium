import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ProcessSandbox, SandboxResult, SandboxRun } from '../contracts/execution.ts'
import { backgroundPriority, resourceEnvironment } from './resources.ts'

/** The runner reads its requests from this file of the run directory (`runner.py`, the script and WASI runners). */
export const RUN_REQUEST_FILE = '.presmium/request.json'

export const RUN_RESULT_PREFIX = '.presmium/result-'

/** The runner writes the result of the request at this index here, once it is complete. */
export function runResultFile(index: number): string {
  return `${RUN_RESULT_PREFIX}${index}.json`
}

/** The environment of a run that is given none: `PATH`, `LANG` and a temporary `HOME`, no credentials. */
export function minimalRunEnv(): Record<string, string> {
  const home = join(tmpdir(), 'presmium-home')
  mkdirSync(home, { recursive: true })
  return { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', HOME: home }
}

/** The process sandbox when none is configured: runs the command directly, in a new temporary run directory. */
export const directSandbox: ProcessSandbox = {
  kind: 'none',
  run(request: SandboxRun): Promise<SandboxResult> {
    const dir = mkdtempSync(join(tmpdir(), 'presmium-run-'))
    for (const [path, content] of Object.entries(request.files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    return new Promise((resolve) => {
      const [command, ...args] = request.argv
      const child = spawn(command!, args, { cwd: dir, env: resourceEnvironment(request.env), stdio: ['ignore', 'pipe', 'pipe'] })
      backgroundPriority(child.pid)
      const out: Buffer[] = []
      const err: Buffer[] = []
      let stopped = false
      const stop = () => {
        stopped = true
        child.kill('SIGKILL')
      }
      const timer = setTimeout(stop, request.timeoutMs)
      if (request.signal?.aborted) stop()
      request.signal?.addEventListener('abort', stop, { once: true })
      child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
      let settled = false
      const finish = (exitCode: number | null, error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        request.signal?.removeEventListener('abort', stop)
        const files: Record<string, Uint8Array> = {}
        for (const path of request.collect) {
          try {
            files[path] = readFileSync(join(dir, path))
          } catch {}
        }
        rmSync(dir, { recursive: true, force: true })
        const stderr = Buffer.concat(err).toString('utf8').replaceAll(dir, '.')
        resolve({ exitCode: stopped ? null : exitCode, stdout: Buffer.concat(out).toString('utf8'), stderr: error ? `${stderr}${error.message}` : stderr, files })
      }
      child.on('error', error => finish(null, error))
      child.on('close', code => finish(code))
    })
  },
}
