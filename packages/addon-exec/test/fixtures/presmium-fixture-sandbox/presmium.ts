// An operator plugin (operator: true) whose Node service is the process sandbox (`PROCESS_SANDBOX`,
// docs/architecture.md 4.6): it runs the command directly, without isolation, in a new run
// directory holding the given files, with exactly the given environment, reads back the files to
// collect, and appends each call (command, files, collected paths, environment) as a JSON line to
// the file its operator setting `log` names. Plain objects and Node's own modules; no package needed.
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

interface SandboxRun {
  argv: string[]
  files: Record<string, string | Uint8Array>
  collect: string[]
  env: Record<string, string>
  read: string[]
  timeoutMs: number
}

function sandbox(log: string) {
  return {
    kind: 'fixture-direct',
    run(request: SandboxRun) {
      const dir = mkdtempSync(join(tmpdir(), 'presmium-fixture-sandbox-'))
      for (const [path, content] of Object.entries(request.files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), content)
      }
      const files = Object.fromEntries(Object.entries(request.files).map(([path, content]) => [path, typeof content === 'string' ? content : Buffer.from(content).toString('utf8')]))
      appendFileSync(log, `${JSON.stringify({ argv: request.argv.slice(0, 1), files, collect: request.collect, env: request.env })}\n`)
      return new Promise((resolve) => {
        const [command, ...args] = request.argv
        const child = spawn(command!, args, { cwd: dir, env: request.env })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk: Buffer) => stdout += chunk)
        child.stderr.on('data', (chunk: Buffer) => stderr += chunk)
        const timer = setTimeout(() => child.kill('SIGKILL'), request.timeoutMs)
        child.on('close', (code) => {
          clearTimeout(timer)
          const collected: Record<string, Uint8Array> = {}
          for (const path of request.collect) {
            try {
              collected[path] = readFileSync(join(dir, path))
            } catch {}
          }
          rmSync(dir, { recursive: true, force: true })
          resolve({ exitCode: code, stdout, stderr, files: collected })
        })
      })
    },
  }
}

export default {
  id: 'fixture.sandbox',
  version: '0.1.0',
  kernel: '^1.0.0',
  operator: true,
  services: (ctx: { settings: Record<string, unknown> }) => [[{ id: 'presmium.processSandbox' }, sandbox(String(ctx.settings.log))]],
}
