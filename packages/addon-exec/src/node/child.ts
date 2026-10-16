/**
 * Compile-time execution in a child process (K-19), shared by the local
 * executors: the runner (src/runner.py, src/runner.mjs) reads its input as
 * JSON on stdin and writes `{ stdout, stderr, exitCode }` to file descriptor
 * 3, a channel of its own, so whatever the program writes to its standard
 * streams cannot break the result. Each run starts in a fresh temporary
 * directory and is killed once it exceeds its timeout. What a run records
 * goes into the published forms, whatever the deck's language, so the
 * messages added here are English, like the interpreters' own, and name
 * nothing of the build machine (K-13).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failedRun } from '@presmium/kernel'
import type { RunRequest, RunResult } from '@presmium/kernel'
import { DEFAULT_EXEC_CONFIG } from '../domain/index.ts'

interface RunnerOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ChildRunner {
  executorId: string
  command: string
  args: string[]
  env?: Record<string, string>
}

/** Node's exit code when the event loop empties while a top-level await is still pending. */
const UNSETTLED_AWAIT = 13

export function runChild(runner: ChildRunner, request: RunRequest, input: unknown, signal?: AbortSignal): Promise<RunResult> {
  const id = runner.executorId
  const timeoutMs = request.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs
  const cwd = mkdtempSync(join(tmpdir(), 'presmium-run-'))
  const started = Date.now()
  return new Promise<RunResult>((resolve) => {
    const child = spawn(runner.command, runner.args, { cwd, env: { ...process.env, ...runner.env }, signal, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] })
    const result: Buffer[] = []
    const err: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout!.resume()
    child.stderr!.on('data', (chunk: Buffer) => err.push(chunk))
    child.stdio[3]!.on('data', (chunk: Buffer) => result.push(chunk))
    const finish = (outcome: RunResult) => {
      clearTimeout(timer)
      rmSync(cwd, { recursive: true, force: true })
      resolve(outcome)
    }
    child.on('error', error => finish(failedRun(id, error.message, Date.now() - started)))
    child.on('close', (code) => {
      const durationMs = Date.now() - started
      if (timedOut) return finish({ ...failedRun(id, `Stopped after ${timeoutMs} ms`, durationMs), timedOut: true })
      let output: RunnerOutput
      try {
        output = JSON.parse(Buffer.concat(result).toString('utf8')) as RunnerOutput
      }
      catch {
        if (code === UNSETTLED_AWAIT) return finish({ ...failedRun(id, 'The program ended while a top-level await was still pending', durationMs), exitCode: code })
        const stderr = Buffer.concat(err).toString('utf8').replaceAll(cwd, '.')
        return finish(failedRun(id, stderr || `the ${id} runner produced no result`, durationMs))
      }
      finish({ ok: output.exitCode === 0, stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode, durationMs, timedOut: false, source: 'live', executorId: id })
    })
    child.stdin!.on('error', () => {})
    child.stdin!.end(JSON.stringify(input))
  })
}
