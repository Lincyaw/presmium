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
  /** Called once when the timeout fires or the signal aborts, before the process is killed. */
  onStop?: () => void
}

/** Runs a command to completion and collects its output; never rejects. */
export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: 'pipe' })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let timedOut = false
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      options.onStop?.()
      child.kill('SIGTERM')
    }
    const timer = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true
          stop()
        }, options.timeoutMs)
    options.signal?.addEventListener('abort', stop, { once: true })
    const finish = (code: number | null, error?: Error) => {
      clearTimeout(timer)
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
