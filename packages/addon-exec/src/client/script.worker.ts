/// <reference lib="webworker" />
/**
 * Runs one JavaScript or TypeScript request off the main thread (src/runner.mjs);
 * the executor starts a worker per run and terminates it when the run ends or times out.
 */
import { runScript } from '../runner.mjs'
import type { ScriptRequest } from '../runner.mjs'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async ({ data }: MessageEvent<ScriptRequest>) => {
  self.postMessage(await runScript(data))
}
