export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })
}

export function problemResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status)
}

export function sseResponse(events: AsyncIterable<{ event?: string, data: unknown }>, signal?: AbortSignal): Response {
  const encoder = new TextEncoder()
  const iterator = events[Symbol.asyncIterator]()
  let closed = false
  const stop = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return
    closed = true
    void iterator.return?.()
    try {
      controller?.close()
    } catch {
    }
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) stop(controller)
      else signal?.addEventListener('abort', () => stop(controller), { once: true })
    },
    async pull(controller) {
      if (closed) return
      try {
        const next = await iterator.next()
        if (closed) return
        if (next.done) {
          stop(controller)
          return
        }
        const { event, data } = next.value
        const lines = `${event ? `event: ${event}\n` : ''}${JSON.stringify(data ?? null).split('\n').map(line => `data: ${line}`).join('\n')}\n\n`
        controller.enqueue(encoder.encode(lines))
      } catch (error) {
        closed = true
        controller.error(error)
      }
    },
    cancel() {
      stop()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
}
