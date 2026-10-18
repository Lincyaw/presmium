/// <reference lib="webworker" />
import { runScript } from '../runner.mjs'
import type { ScriptRequest } from '../runner.mjs'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async ({ data }: MessageEvent<ScriptRequest>) => {
  self.postMessage(await runScript(data))
}
