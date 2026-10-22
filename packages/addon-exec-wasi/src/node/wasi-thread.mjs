import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { prepare, runWasi } from '../shared/wasi-runner.mjs'

const { request, dir } = workerData
const load = name => readFile(join(dir, name))

try {
  await prepare(request.lang, load)
  parentPort.postMessage({ type: 'started' })
  parentPort.postMessage({ type: 'done', output: await runWasi(request, load) })
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
}
