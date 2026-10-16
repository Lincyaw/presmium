/// <reference lib="webworker" />
/**
 * Runs Python in Pyodide off the main thread, so a run that never ends can be
 * stopped by terminating the worker. Requests are handled one at a time. The
 * runner (`@presmium/kernel/runner.py`, the one compile time uses) keeps the
 * globals of each session until the session ends (P-101).
 */
import { errorMessage } from '@presmium/kernel'
import type { loadPyodide as LoadPyodide, PyodideInterface } from 'pyodide'
import runner from '@presmium/kernel/runner.py?raw'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

let runtime: Promise<PyodideInterface> | undefined

async function start(indexURL: string): Promise<PyodideInterface> {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as { loadPyodide: typeof LoadPyodide }
  const pyodide = await loadPyodide({ indexURL })
  pyodide.runPython(runner)
  return pyodide
}

/** Loads the runtime once; a failed load is retried by the next request. */
function load(indexURL: string): Promise<PyodideInterface> {
  runtime ??= start(indexURL).catch((error: unknown) => {
    runtime = undefined
    throw error
  })
  return runtime
}

const reply = (message: WorkerReply) => self.postMessage(message)

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, kind, request, indexURL, maxEvents } = data
  try {
    const pyodide = await load(indexURL)
    reply({ id, type: 'started' })
    const fn = pyodide.globals.get(kind === 'trace' ? '_pm_trace' : kind === 'end' ? '_pm_end' : '_pm_run')
    try {
      const started = performance.now()
      const json = kind === 'end'
        ? (fn(request.session ?? ''), 'null')
        : fn(request.code, JSON.stringify(request.args ?? {}), request.stdin ?? '', JSON.stringify(request.files ?? {}), maxEvents, request.session ?? null) as string
      reply({ id, type: 'done', value: JSON.parse(json), durationMs: Math.round(performance.now() - started) })
    } finally {
      fn.destroy()
    }
  } catch (error) {
    reply({ id, type: 'failed', error: errorMessage(error) })
  }
}
