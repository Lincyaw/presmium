import { failedRun } from '@lincyaw/kernel'
import type { RunContext, RunOutput, RunRequest, RunResult, SandboxResult } from '@lincyaw/kernel'
import { directSandbox, minimalRunEnv, NODE_RESOURCE_ARGS, RUN_REQUEST_FILE, runResultFile } from '@lincyaw/kernel/node'
import { DEFAULT_EXEC_CONFIG } from '../domain/index.ts'

interface RunnerOutput {
  stdout: string
  stderr: string
  exitCode: number
  outputs?: RunOutput[]
}

const UNSETTLED_AWAIT = 13

/** How an executor starts the child process that runs its requests: the command, the paths it reads, whether it keeps sessions. */
export interface ChildLaunchSpec {
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

interface RunSession {
  history: RunRequest[]
  queue: Pending[]
  tail: Promise<void>
}

/**
 * Runs requests in a child process, in the process sandbox when one is configured: requests of a session that arrive
 * together go into one run, and a later one first runs the session's earlier requests again.
 */
export function createChildProcessRuns(launch: ChildLaunchSpec) {
  const runSessions = new Map<string, RunSession>()

  async function batch(requests: RunRequest[], skip: number, signal?: AbortSignal, ctx?: RunContext): Promise<RunResult[]> {
    const id = launch.executorId
    const session = launch.sessions ? requests[0]?.session : undefined
    const input = { session, runs: requests.map(({ code, args, stdin, files, lang }) => ({ code, args, stdin, files, lang })) }
    const timeouts = requests.map(r => r.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs)
    const timeoutMs = timeouts.reduce((sum, t) => sum + t, 0)
    const sandbox = ctx?.sandbox ?? directSandbox
    const started = Date.now()
    let outcome: SandboxResult
    try {
      outcome = await sandbox.run({
        argv: launch.argv[0] === process.execPath ? [process.execPath, ...NODE_RESOURCE_ARGS, ...launch.argv.slice(1)] : launch.argv,
        files: { [RUN_REQUEST_FILE]: JSON.stringify(input) },
        collect: requests.map((_, i) => runResultFile(i)),
        env: ctx?.env ?? minimalRunEnv(),
        read: launch.read(),
        timeoutMs,
        signal,
      })
    } catch (error) {
      return requests.slice(skip).map(() => failedRun(id, `the ${sandbox.kind} sandbox failed: ${error instanceof Error ? error.message : String(error)}`, Date.now() - started))
    }
    const durationMs = Date.now() - started
    let missing = false
    return requests.map((_, i): RunResult => {
      const file = outcome.files[runResultFile(i)]
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

  async function flush(state: RunSession): Promise<void> {
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
      const name = launch.sessions ? request.session : undefined
      if (!name) return batch([request], 0, signal, ctx).then(results => results[0]!)
      let state = runSessions.get(name)
      if (!state) runSessions.set(name, state = { history: [], queue: [], tail: Promise.resolve() })
      const runSession = state
      return new Promise((resolve) => {
        runSession.queue.push({ request, signal, ctx, resolve })
        if (runSession.queue.length === 1) runSession.tail = runSession.tail.then(() => new Promise(next => setImmediate(next))).then(() => flush(runSession))
      })
    },
    async endSession(session: string): Promise<void> {
      runSessions.delete(session)
    },
  }
}
