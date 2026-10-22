/// <reference lib="webworker" />
import { compute } from '../shared/gpu-compute.mjs'
import type { WorkerReply, WorkerRequest } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

let device: { destroy(): void } | undefined
const reply = (message: WorkerReply) => self.postMessage(message)

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'stop') {
    device?.destroy()
    return reply({ type: 'stopped' })
  }
  const gpu = (self.navigator as WorkerNavigator & { gpu?: unknown }).gpu
  reply({ type: 'done', outcome: await compute(gpu, data.request, { device: (d) => { device = d } }) })
}
