import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { failedRun } from '@lincyaw/kernel'
import type { ProcessSandbox, RunContext, RunOutput, RunRequest, RunResult, SandboxResult, SandboxRun } from '@lincyaw/kernel'
import { DEFAULT_EXEC_CONFIG } from '../domain/index.ts'

interface RunnerOutput {
  stdout: string
  stderr: string
  exitCode: number
  outputs?: RunOutput[]
}

export const REQUEST_FILE = '.presmium/request.json'
const resultFile = (i: number) => `.presmium/result-${i}.json`

const UNSETTLED_AWAIT = 13

export function plainEnv(): Record<string, string> {
  const home = join(tmpdir(), 'presmium-home')
  mkdirSync(home, { recursive: true })
  return { PATH: process.env.PATH ?? '', LANG: process.env.LANG ?? 'C.UTF-8', HOME: home }
}

export const directRun: ProcessSandbox = {
  kind: 'none',
  run(request: SandboxRun): Promise<SandboxResult> {
    const dir = mkdtempSync(join(tmpdir(), 'presmium-run-'))
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
        const stderr = Buffer.concat(err).toString('utf8').replaceAll(dir, '.')
        resolve({ exitCode: stopped ? null : exitCode, stdout: Buffer.concat(out).toString('utf8'), stderr: error ? `${stderr}${error.message}` : stderr, files })
      }
      child.on('error', error => finish(null, error))
      child.on('close', code => finish(code))
    })
  },
}

export interface ChildRunner {
  executorId: string
  argv: string[]
  read(): string[]
  sessions: boolean
}

interface Pending {
  request: RunRequest
  signal?: AbortSignal
  ctx?: RunContext
  resolve(result: RunResult): void
}

interface Session {
  history: RunRequest[]
  queue: Pending[]
  tail: Promise<void>
}

export function childRuns(runner: ChildRunner) {
  const sessions = new Map<string, Session>()

  async function batch(requests: RunRequest[], skip: number, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult[]> {
    const id = runner.executorId
    const session = runner.sessions ? requests[0]?.session : undefined
    const input = { session, runs: requests.map(({ code, args, stdin, files, lang }) => ({ code, args, stdin, files, lang })) }
    const timeouts = requests.map(r => r.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs)
    const timeoutMs = timeouts.reduce((sum, t) => sum + t, 0)
    const sandbox = ctx?.sandbox ?? directRun
    const started = Date.now()
    let outcome: SandboxResult
    try {
      outcome = await sandbox.run({
        argv: runner.argv,
        files: { [REQUEST_FILE]: JSON.stringify(input) },
        collect: requests.map((_, i) => resultFile(i)),
        env: ctx?.env ?? plainEnv(),
        read: runner.read(),
        timeoutMs,
        signal,
      })
    } catch (error) {
      return requests.slice(skip).map(() => failedRun(id, `the ${sandbox.kind} sandbox failed: ${error instanceof Error ? error.message : String(error)}`, Date.now() - started))
    }
    const durationMs = Date.now() - started
    let missing = false
    return requests.map((_, i): RunResult => {
      const file = outcome.files[resultFile(i)]
      let output: RunnerOutput | undefined
      try {
        output = file ? JSON.parse(Buffer.from(file).toString('utf8')) as RunnerOutput : undefined
      } catch {}
      if (output) return { ok: output.exitCode === 0, stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode, durationMs, timedOut: false, source: 'live', executorId: id, ...output.outputs ? { outputs: output.outputs } : {} }
      const first = !missing
      missing = true
      if (!first) return failedRun(id, 'Not run: an earlier block of the session did not finish', durationMs)
      if (outcome.exitCode === null && !signal?.aborted) return { ...failedRun(id, `Stopped after ${timeouts.slice(0, i + 1).reduce((sum, t) => sum + t, 0)} ms`, durationMs), timedOut: true }
      if (outcome.exitCode === UNSETTLED_AWAIT) return { ...failedRun(id, 'The program ended while a top-level await was still pending', durationMs), exitCode: outcome.exitCode }
      return failedRun(id, outcome.stderr || `the ${id} runner produced no result`, durationMs)
    }).slice(skip)
  }

  async function flush(state: Session): Promise<void> {
    const queue = state.queue
    state.queue = []
    const skip = state.history.length
    const requests = [...state.history, ...queue.map(p => p.request)]
    const results = await batch(requests, skip, queue[0]?.signal, queue[0]?.ctx)
    state.history = requests
    queue.forEach((pending, i) => pending.resolve(results[i]!))
  }

  return {
    run(request: RunRequest, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult> {
      const name = runner.sessions ? request.session : undefined
      if (!name) return batch([request], 0, signal, ctx).then(results => results[0]!)
      let state = sessions.get(name)
      if (!state) sessions.set(name, state = { history: [], queue: [], tail: Promise.resolve() })
      const session = state
      return new Promise((resolve) => {
        session.queue.push({ request, signal, ctx, resolve })
        if (session.queue.length === 1) session.tail = session.tail.then(() => new Promise(next => setImmediate(next))).then(() => flush(session))
      })
    },
    async endSession(session: string): Promise<void> {
      sessions.delete(session)
    },
  }
}
