/// <reference lib="webworker" />
import { runScript } from '../../shared/script-runner.mjs'
import type { ScriptRequest } from '../../shared/script-runner.mjs'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async ({ data }: MessageEvent<ScriptRequest>) => {
  self.postMessage(await runScript(data))
}
