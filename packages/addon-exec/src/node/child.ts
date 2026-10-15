/**
 * Compile-time execution in a child process (K-19), shared by the local
 * executors: the runner (src/runner.py, src/runner.mjs) reads its input as
 * JSON on stdin and prints `{ stdout, stderr, exitCode }`. Each run starts in
 * a fresh temporary directory and is killed once it exceeds its timeout.
 * What a run records goes into the published forms, whatever the deck's
 * language, so the messages added here are English, like the interpreters'
 * own, and name nothing of the build machine (K-13).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunRequest, RunResult } from '@presmium/kernel'
import { DEFAULT_EXEC_CONFIG, failedRun } from '../domain/index.ts'

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

export function runChild(runner: ChildRunner, request: RunRequest, input: unknown, signal?: AbortSignal): Promise<RunResult> {
  const id = runner.executorId
  const timeoutMs = request.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs
  const cwd = mkdtempSync(join(tmpdir(), 'presmium-run-'))
  const started = Date.now()
  return new Promise<RunResult>((resolve) => {
    const child = spawn(runner.command, runner.args, { cwd, env: { ...process.env, ...runner.env }, signal })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    const finish = (result: RunResult) => {
      clearTimeout(timer)
      rmSync(cwd, { recursive: true, force: true })
      resolve(result)
    }
    child.on('error', error => finish(failedRun(id, error.message, Date.now() - started)))
    child.on('close', () => {
      const durationMs = Date.now() - started
      if (timedOut) return finish({ ...failedRun(id, `Stopped after ${timeoutMs} ms`, durationMs), timedOut: true })
      let output: RunnerOutput
      try {
        output = JSON.parse(Buffer.concat(out).toString('utf8')) as RunnerOutput
      }
      catch {
        return finish(failedRun(id, Buffer.concat(err).toString('utf8') || `the ${id} runner produced no result`, durationMs))
      }
      finish({ ok: output.exitCode === 0, stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode, durationMs, timedOut: false, source: 'live', executorId: id })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(input))
  })
}
