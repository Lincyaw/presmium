/// <reference lib="webworker" />
import { prepare, runWasi } from '../shared/wasi-runner.mjs'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

const reply = (message: WorkerReply) => self.postMessage(message)
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, request, runtimeURL } = data
  const load = async (file: string) => {
    const response = await fetch(new URL(file, runtimeURL))
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }
  try {
    await prepare(request.lang, load)
  } catch (error) {
    return reply({ id, type: 'error', stage: 'load', error: reason(error) })
  }
  reply({ id, type: 'started' })
  try {
    reply({ id, type: 'done', output: await runWasi(request, load) })
  } catch (error) {
    reply({ id, type: 'error', stage: 'run', error: reason(error) })
  }
}
