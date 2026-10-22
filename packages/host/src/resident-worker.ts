export interface ResidentWorkerOptions {
  start(): Worker
  loadTimeoutMs: number
}

export type ResidentWorkerFailure = 'cancelled' | 'load-timeout' | 'run-timeout' | 'crashed'

export type ResidentWorkerOutcome<Reply> =
  | { reply: Reply, elapsedMs: number }
  | { failure: ResidentWorkerFailure, error?: string, elapsedMs: number }

export interface ResidentWorker<Request extends { id: number }, Reply extends { id: number, type: string }> {
  send(request: Omit<Request, 'id'>, options: { timeoutMs: number, signal?: AbortSignal }): Promise<ResidentWorkerOutcome<Exclude<Reply, { type: 'started' }>>>
  hasWorker(): boolean
  dispose(): void
}

/**
 * A dedicated Worker kept between requests, which it takes one at a time. Until the worker replies `started` the load
 * timeout runs, then the request's own; a timeout, an abort or a crash ends the worker, and the next request starts another.
 */
export function createResidentWorker<Request extends { id: number }, Reply extends { id: number, type: string }>(options: ResidentWorkerOptions): ResidentWorker<Request, Reply> {
  type Outcome = ResidentWorkerOutcome<Exclude<Reply, { type: 'started' }>>
  let worker: Worker | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let ids = 0
  let cancel: (() => void) | undefined
  let disposed = false

  return {
    send(request, { timeoutMs, signal }) {
      const job = () => new Promise<Outcome>((resolve) => {
        if (disposed || signal?.aborted) return resolve({ failure: 'cancelled', elapsedMs: 0 })
        const target = worker ??= options.start()
        const id = ++ids
        let started = 0
        const elapsed = () => (started ? Math.round(performance.now() - started) : 0)
        const finish = (outcome: Outcome) => {
          clearTimeout(timer)
          cancel = undefined
          target.removeEventListener('message', onMessage)
          target.removeEventListener('error', onError)
          signal?.removeEventListener('abort', onAbort)
          resolve(outcome)
        }
        const stop = (failure: ResidentWorkerFailure, error?: string) => {
          target.terminate()
          if (worker === target) worker = undefined
          finish({ failure, ...error === undefined ? {} : { error }, elapsedMs: elapsed() })
        }
        const onMessage = ({ data }: MessageEvent<Reply>) => {
          if (data.id !== id) return
          if (data.type === 'started') {
            clearTimeout(timer)
            started = performance.now()
            timer = setTimeout(() => stop('run-timeout'), timeoutMs)
          } else {
            finish({ reply: data as Exclude<Reply, { type: 'started' }>, elapsedMs: elapsed() })
          }
        }
        const onError = (event: ErrorEvent) => stop('crashed', event.message)
        const onAbort = () => stop('cancelled')
        cancel = onAbort
        target.addEventListener('message', onMessage)
        target.addEventListener('error', onError)
        signal?.addEventListener('abort', onAbort)
        let timer = setTimeout(() => stop('load-timeout'), options.loadTimeoutMs)
        target.postMessage({ ...request, id })
      })
      const outcome = queue.then(job)
      queue = outcome.catch(() => undefined)
      return outcome
    },
    hasWorker: () => worker !== undefined,
    dispose() {
      if (disposed) return
      disposed = true
      cancel?.()
      worker?.terminate()
      worker = undefined
      queue = Promise.resolve()
    },
  }
}
