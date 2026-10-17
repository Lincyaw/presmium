// The worker thread of one compile-time run (./child.mjs): loads the runtime from the installed
// files, says when it has, runs the request with the runner the browser uses too (../runner.mjs)
// and posts the output. A run that exceeds its timeout ends with the thread.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { prepare, runWasi } from '../runner.mjs'

const { request, dir } = workerData
const load = name => readFile(join(dir, name))

try {
  await prepare(request.lang, load)
  parentPort.postMessage({ type: 'started' })
  parentPort.postMessage({ type: 'done', output: await runWasi(request, load) })
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) })
}
