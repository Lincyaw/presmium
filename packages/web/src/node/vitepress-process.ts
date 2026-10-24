import { realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { findPackageBin, forEachLine, spawnBackgroundNode, spawnInteractiveNode } from '@lincyaw/kernel/node'
import type { DevMessage } from './vite-plugins.ts'

function vitepressBin(): string {
  const bin = findPackageBin('vitepress', 'vitepress', import.meta.url)
  if (!bin) throw new Error('vitepress is not installed')
  return bin
}

/** Runs `vitepress build`, its output to `log` a line at a time (else to this process's stderr); resolves to its exit code. */
export function runVitepressBuild(root: string, outDir: string, log?: (line: string) => void): Promise<number> {
  return new Promise((done) => {
    const child = spawnBackgroundNode(vitepressBin(), ['build', realpathSync(root), '--outDir', outDir], { stdio: log ? ['ignore', 'pipe', 'pipe'] : ['ignore', 2, 2] })
    if (log) for (const stream of [child.stdout, child.stderr]) forEachLine(stream, log)
    child.on('exit', code => done(code ?? 1))
    child.on('error', () => done(1))
  })
}

function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

export interface VitepressDevProcess {
  port: number
  send(message: DevMessage): void
  close(): Promise<void>
}

/** Starts `vitepress dev` and resolves when it listens; `receive` gets its messages, and the abort signal stops it. */
export async function startVitepressDev(root: string, port: number | undefined, receive: (message: DevMessage) => void, options: { host?: string, signal?: AbortSignal } = {}): Promise<VitepressDevProcess> {
  const listen = port === 0 ? await findFreePort(options.host ?? '127.0.0.1') : port
  const args = ['dev', realpathSync(root), ...(listen ? ['--port', String(listen)] : []), ...(options.host ? ['--host', options.host] : [])]
  // The author waits for the preview: the dev server takes the interactive thread budget, at normal priority.
  const child = spawnInteractiveNode(vitepressBin(), args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
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
          const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
          await exited
          clearTimeout(timer)
        },
      })
    })
  })
}
