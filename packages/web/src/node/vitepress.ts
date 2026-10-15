/** Runs the VitePress command line, the documented interface of VitePress. */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { DevMessage } from './vite.ts'

function bin(): string {
  const require = createRequire(import.meta.url)
  const pkg = require.resolve('vitepress/package.json')
  return join(dirname(pkg), (require(pkg) as { bin: Record<string, string> }).bin.vitepress!)
}

/**
 * `vitepress build <root> --outDir <outDir>`. VitePress reports progress on
 * stdout; it goes to stderr here, so the build report of `presmium build`
 * stays readable on stdout.
 */
export function vitepressBuild(root: string, outDir: string): Promise<number> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin(), 'build', root, '--outDir', outDir], { stdio: ['ignore', 2, 2] })
    child.on('exit', code => done(code ?? 1))
    child.on('error', () => done(1))
  })
}

export interface DevProcess {
  port: number
  send(message: DevMessage): void
  close(): Promise<void>
}

/** `vitepress dev <root>` with an IPC channel; resolves once the server listens. `receive` gets the other messages of the server. */
export function vitepressDev(root: string, port: number | undefined, receive: (message: DevMessage) => void): Promise<DevProcess> {
  const args = [bin(), 'dev', root, ...(port ? ['--port', String(port)] : [])]
  const child: ChildProcess = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`vitepress dev exited with code ${code}`)))
    child.on('message', (message: DevMessage) => {
      if (message?.type !== 'presmium:ready') {
        receive(message)
        return
      }
      resolve({
        port: message.port,
        send: m => void child.send(m),
        async close() {
          if (child.exitCode === null) child.kill('SIGTERM')
          await exited
        },
      })
    })
  })
}
