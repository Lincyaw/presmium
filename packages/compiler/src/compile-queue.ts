import { setImmediate } from 'node:timers/promises'
import { AsyncLocalStorage } from 'node:async_hooks'

type Job = { run(): Promise<void>, interactive: boolean }
const waiting: Job[] = []
let running = false
const nesting = new AsyncLocalStorage<boolean>()

/** One compilation per host process. Interactive work precedes queued batch builds. */
export function enqueueCompile<T>(run: () => Promise<T>, interactive: boolean): Promise<T> {
  if (nesting.getStore()) return run()
  return new Promise((resolve, reject) => {
    waiting.push({ interactive, run: async () => { try { resolve(await nesting.run(true, run)) } catch (error) { reject(error) } } })
    void next()
  })
}

async function next(): Promise<void> {
  if (running || waiting.length === 0) return
  running = true
  const firstInteractive = waiting.findIndex(job => job.interactive)
  const job = waiting.splice(firstInteractive < 0 ? 0 : firstInteractive, 1)[0]!
  try { await job.run() } finally {
    await setImmediate()
    running = false
    void next()
  }
}
