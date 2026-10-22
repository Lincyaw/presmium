import type { ServerConnection } from '@jupyterlab/services'
import type { OutputCollector } from '../domain/outputs.ts'
import type { JupyterKernelHandle } from './kernel-lifecycle.ts'
import { loadJupyterServices } from './load-services.ts'

const INTERRUPT_GRACE_MS = 5_000

/** Writes the run's files into the kernel's directory through the Contents API. */
export async function writeRunFiles(handle: JupyterKernelHandle, settings: ServerConnection.ISettings, files: Record<string, string>): Promise<void> {
  const { Drive } = await loadJupyterServices()
  const drive = new Drive({ serverSettings: settings })
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0 || parts.some(part => part === '..' || part === '.')) continue
    for (let i = 1; i < parts.length; i++) await drive.save(`${handle.dir}/${parts.slice(0, i).join('/')}`, { type: 'directory' })
    await drive.save(`${handle.dir}/${parts.join('/')}`, { type: 'file', format: 'text', content })
  }
}

export interface ExecuteOptions {
  stdin: string
  /** Collects the outputs; without it the code runs silently. */
  collector?: OutputCollector
  timeoutMs: number
  signal?: AbortSignal
  shutdown(): Promise<void>
}

/**
 * Executes code on the kernel, answering its input requests with the lines of `stdin`. Past the timeout, or on abort,
 * it interrupts the kernel, and shuts the kernel down if it is still busy after a grace period.
 */
export async function executeCode(handle: JupyterKernelHandle, code: string, options: ExecuteOptions): Promise<{ status: string, timedOut: boolean }> {
  const { KernelAPI } = await loadJupyterServices()
  const { collector, signal } = options
  signal?.throwIfAborted()
  const lines = options.stdin ? options.stdin.replace(/\n$/, '').split('\n') : []
  const future = handle.connection.requestExecute({ code, silent: !collector, store_history: false, allow_stdin: true, stop_on_error: true })
  future.onIOPub = (msg) => {
    collector?.add(msg.header.msg_type, msg.content)
  }
  future.onStdin = (msg) => {
    if (msg.header.msg_type === 'input_request') handle.connection.sendInputReply({ status: 'ok', value: lines.shift() ?? '' }, msg.header as never)
  }
  let timedOut = false
  let stopping: ReturnType<typeof setTimeout> | undefined
  const interrupt = () => {
    if (stopping) return
    void KernelAPI.interruptKernel(handle.id, handle.connection.serverSettings).catch(() => {})
    stopping = setTimeout(() => void options.shutdown().catch(() => {}), INTERRUPT_GRACE_MS)
  }
  const timer = setTimeout(() => {
    timedOut = true
    interrupt()
  }, options.timeoutMs)
  const abort = () => interrupt()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const reply = await future.done
    return { status: reply.content.status, timedOut }
  } catch (error) {
    if (timedOut) return { status: 'error', timedOut }
    throw error
  } finally {
    clearTimeout(timer)
    clearTimeout(stopping)
    signal?.removeEventListener('abort', abort)
    future.dispose()
  }
}
