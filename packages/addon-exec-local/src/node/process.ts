import { spawn } from 'node:child_process'
import { backgroundPriority, resourceEnvironment } from '@lincyaw/kernel/node'

export interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ProcessOptions {
  cwd?: string
  env?: Record<string, string>
  input?: string
  timeoutMs?: number
  signal?: AbortSignal
  onStop?: () => void
}

const GRACE_MS = 5_000

export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const group = process.platform !== 'win32'
    const child = spawn(command, args, { cwd: options.cwd, env: resourceEnvironment(options.env), stdio: 'pipe', detached: group })
    backgroundPriority(child.pid)
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let timedOut = false
    let stopped = false
    let kill: ReturnType<typeof setTimeout> | undefined
    const send = (signal: NodeJS.Signals) => {
      try {
        if (group && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      }
      catch {}
    }
    const stop = () => {
      if (stopped) return
      stopped = true
      options.onStop?.()
      send('SIGTERM')
      kill = setTimeout(() => send('SIGKILL'), GRACE_MS)
    }
    const timer = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true
          stop()
        }, options.timeoutMs)
    if (options.signal?.aborted) stop()
    options.signal?.addEventListener('abort', stop, { once: true })
    const finish = (code: number | null, error?: Error) => {
      clearTimeout(timer)
      clearTimeout(kill)
      options.signal?.removeEventListener('abort', stop)
      const err = Buffer.concat(stderr).toString('utf8')
      resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: error ? `${err}${error.message}` : err, timedOut })
    }
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', error => finish(null, error))
    child.on('close', code => finish(code))
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}
