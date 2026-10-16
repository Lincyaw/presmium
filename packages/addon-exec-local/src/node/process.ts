import { spawn } from 'node:child_process'

export interface ProcessResult {
  /** Exit code; null when the process could not start or was killed by a signal. */
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ProcessOptions {
  cwd?: string
  /** Written to stdin, which is then closed. */
  input?: string
  timeoutMs?: number
  signal?: AbortSignal
  /** Called once when the timeout fires or the signal aborts, before the process is stopped. */
  onStop?: () => void
}

/** How long a stopped process has to end after SIGTERM before it is killed. */
const GRACE_MS = 5_000

/**
 * Runs a command to completion and collects its output; never rejects. When
 * the timeout fires or the signal aborts, the process gets SIGTERM, and
 * SIGKILL once the grace period is over. Outside Windows it runs in a process
 * group of its own, which both signals reach, so what it started (e.g. the
 * `docker build` of the Dev Containers CLI) stops with it.
 */
export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const group = process.platform !== 'win32'
    const child = spawn(command, args, { cwd: options.cwd, stdio: 'pipe', detached: group })
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
