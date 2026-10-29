export interface PushStream<T> extends AsyncIterable<T> {
  end(): void
}

export interface PushStreamOptions {
  signal?: AbortSignal
  /** Keep only the newest value the reader has not taken, for streams that say "something changed". */
  latestOnly?: boolean
}

/**
 * An async iterable of the values a subscription pushes. `subscribe` runs at once (unless the signal has
 * aborted) and returns its unsubscribe, which runs once when the stream ends: on `end()`, on the signal,
 * or when the reader stops.
 */
export function pushStream<T>(subscribe: (push: (value: T) => void) => () => void, options: PushStreamOptions = {}): PushStream<T> {
  const { signal } = options
  const queue: T[] = []
  let wake: (() => void) | undefined
  let ended = false
  let unsubscribe: (() => void) | undefined
  const end = () => {
    if (ended) return
    ended = true
    signal?.removeEventListener('abort', end)
    try { unsubscribe?.() }
    finally { wake?.() }
  }
  if (signal?.aborted) {
    ended = true
  } else {
    unsubscribe = subscribe((value) => {
      if (ended) return
      if (options.latestOnly) queue.splice(0, queue.length, value)
      else queue.push(value)
      wake?.()
    })
    if (signal?.aborted) end()
    else signal?.addEventListener('abort', end, { once: true })
  }
  return {
    end,
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      const iterator = (async function* () {
        try {
          while (!ended) {
            if (queue.length > 0) {
              yield queue.shift()!
              continue
            }
            await new Promise<void>(resolve => wake = resolve)
            wake = undefined
          }
        } finally {
          end()
        }
      })()
      // Wake a pending next() before the generator queues return() or throw().
      return {
        [Symbol.asyncIterator]() { return this },
        next: value => iterator.next(value),
        return(value) { end(); return iterator.return(value) },
        throw(error) { end(); return iterator.throw(error) },
      }
    },
  }
}
