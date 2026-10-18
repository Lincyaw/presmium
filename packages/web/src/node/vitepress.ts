/**
 * Runs the VitePress command line, the documented interface of VitePress, in
 * a process that loads Presmium's TypeScript also when it is installed under
 * node_modules (`TYPESCRIPT_IMPORT`): the site's config imports it.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { TYPESCRIPT_IMPORT } from '@presmium/kernel/node'
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
    const child = spawn(process.execPath, [...TYPESCRIPT_IMPORT, bin(), 'build', root, '--outDir', outDir], { stdio: ['ignore', 2, 2] })
    child.on('exit', code => done(code ?? 1))
    child.on('error', () => done(1))
  })
}

/** A port free now on `host` (VitePress's command line takes no port 0). */
export function freePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

export interface DevProcess {
  port: number
  send(message: DevMessage): void
  close(): Promise<void>
}

/**
 * `vitepress dev <root>` with an IPC channel; resolves once the server listens. `receive` gets the other
 * messages of the server. `port` 0 takes a free port; `host` is the address it listens on (default VitePress's);
 * an abort of `signal` stops a server still starting.
 */
export async function vitepressDev(root: string, port: number | undefined, receive: (message: DevMessage) => void, options: { host?: string, signal?: AbortSignal } = {}): Promise<DevProcess> {
  const listen = port === 0 ? await freePort(options.host ?? '127.0.0.1') : port
  const args = [...TYPESCRIPT_IMPORT, bin(), 'dev', root, ...(listen ? ['--port', String(listen)] : []), ...(options.host ? ['--host', options.host] : [])]
  const child: ChildProcess = spawn(process.execPath, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  options.signal?.addEventListener('abort', stop, { once: true })
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
          options.signal?.removeEventListener('abort', stop)
          stop()
          // Vite closes its server on SIGTERM and waits for the connections still open; it is not waited for long.
          const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
          await exited
          clearTimeout(timer)
        },
      })
    })
  })
}
