/// <reference lib="webworker" />
import { errorMessage } from '@presmium/kernel'
import type { loadPyodide as LoadPyodide, PyodideInterface } from 'pyodide'
import runner from '@presmium/kernel/runner.py?raw'
import gpuBridge from './presmium_gpu.py?raw'
import type { WorkerReply, WorkerRequest } from './protocol.ts'
import runAwait from './run_await.py?raw'

declare const self: DedicatedWorkerGlobalScope

const MODULES = '/presmium'
const JSPI = typeof (WebAssembly as { Suspending?: unknown }).Suspending === 'function'

let runtime: Promise<PyodideInterface> | undefined

async function start(indexURL: string): Promise<PyodideInterface> {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as { loadPyodide: typeof LoadPyodide }
  const pyodide = await loadPyodide({ indexURL })
  pyodide.runPython(runner)
  pyodide.runPython(runAwait)
  pyodide.FS.mkdirTree(MODULES)
  pyodide.FS.writeFile(`${MODULES}/presmium_gpu.py`, gpuBridge)
  pyodide.runPython(`import sys\nsys.path.append(${JSON.stringify(MODULES)})`)
  return pyodide
}

function load(indexURL: string): Promise<PyodideInterface> {
  runtime ??= start(indexURL).catch((error: unknown) => {
    runtime = undefined
    throw error
  })
  return runtime
}

const reply = (message: WorkerReply) => self.postMessage(message)

function awaiting(pyodide: PyodideInterface, code: string): boolean {
  const awaits = pyodide.globals.get('_pm_awaits')
  try {
    return awaits(code) as boolean
  } finally {
    awaits.destroy()
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, kind, request, indexURL, maxEvents } = data
  try {
    const pyodide = await load(indexURL)
    reply({ id, type: 'started' })
    const awaits = kind === 'run' && awaiting(pyodide, request.code)
    const fn = pyodide.globals.get(kind === 'trace' ? '_pm_trace' : kind === 'end' ? '_pm_end' : awaits ? '_pm_run_await' : '_pm_run')
    try {
      const started = performance.now()
      const args = [request.code, JSON.stringify(request.args ?? {}), request.stdin ?? '', JSON.stringify(request.files ?? {}), maxEvents, request.session ?? null]
      const json = kind === 'end'
        ? (fn(request.session ?? ''), 'null')
        : kind === 'run' && (awaits || JSPI)
          ? await (awaits ? fn(...args) : fn.callPromising(...args)) as string
          : fn(...args) as string
      reply({ id, type: 'done', value: JSON.parse(json), durationMs: Math.round(performance.now() - started) })
    } finally {
      fn.destroy()
    }
  } catch (error) {
    reply({ id, type: 'failed', error: errorMessage(error) })
  }
}
