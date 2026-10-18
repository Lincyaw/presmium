import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { Worker } from 'node:worker_threads'

const { request, dir, timeoutMs, loadTimeoutMs } = JSON.parse(readFileSync('.presmium/request.json', 'utf8'))
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { request, dir }, env: {} })
let started = 0
const elapsed = () => (started ? Math.round(performance.now() - started) : 0)

function finish(result) {
  writeFileSync('.presmium/result-0.part', JSON.stringify({ durationMs: elapsed(), ...result }))
  renameSync('.presmium/result-0.part', '.presmium/result-0.json')
  process.exit(0)
}

let timer = setTimeout(() => finish({ error: `The WASI runtime did not load within ${loadTimeoutMs} ms` }), loadTimeoutMs)
worker.on('message', (reply) => {
  if (reply.type === 'started') {
    clearTimeout(timer)
    started = performance.now()
    timer = setTimeout(() => finish({ error: `Stopped after ${timeoutMs} ms`, timedOut: true }), timeoutMs)
  } else if (reply.type === 'done') {
    finish({ output: reply.output })
  } else {
    finish({ error: `The WASI runtime failed: ${reply.error}` })
  }
})
worker.on('error', error => finish({ error: `The WASI runtime failed: ${error.message}` }))
worker.on('exit', code => finish({ error: `The WASI runtime ended (${code}) before the run did` }))
