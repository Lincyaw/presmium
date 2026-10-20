import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ProcessSandbox, SandboxResult, SandboxRun } from '@lincyaw/kernel'

export const localRun: ProcessSandbox = {
  kind: 'none',
  run(request: SandboxRun): Promise<SandboxResult> {
    const dir = mkdtempSync(join(tmpdir(), 'presmium-wasi-'))
    for (const [path, content] of Object.entries(request.files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    return new Promise((resolve) => {
      const [command, ...args] = request.argv
      const child = spawn(command!, args, { cwd: dir, env: { ...request.env }, stdio: ['ignore', 'pipe', 'pipe'] })
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
        const stderr = Buffer.concat(err).toString('utf8')
        resolve({ exitCode: stopped ? null : exitCode, stdout: Buffer.concat(out).toString('utf8'), stderr: error ? `${stderr}${error.message}` : stderr, files })
      }
      child.on('error', error => finish(null, error))
      child.on('close', code => finish(code))
    })
  },
}
