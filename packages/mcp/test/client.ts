import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

export async function connectMcp(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'presmium-test', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  return client
}

interface ToolResult {
  isError?: boolean
  content?: unknown
}

export function resultOf<T = any>(result: ToolResult): T {
  const [first] = result.content as { type: string, text: string }[]
  try {
    return JSON.parse(first!.text) as T
  } catch {
    return first!.text as T
  }
}

export interface ControlWindow {
  next(event: string, timeoutMs?: number): Promise<Record<string, any>>
  report(body: Record<string, unknown>): Promise<number>
  answer(id: string, allow: boolean): Promise<number>
  close(): void
}

export async function controlWindow(url: string, id: string): Promise<ControlWindow> {
  const abort = new AbortController()
  const control = `${url}/__presmium/presmium.server/control`
  const response = await fetch(`${control}?window=${id}&document=`, { headers: { Accept: 'text/event-stream' }, signal: abort.signal })
  if (response.status !== 200 || !response.body) throw new Error(`the control channel answered ${response.status}`)
  const events: { event: string, data: Record<string, any> }[] = []
  const waiting: (() => void)[] = []
  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for await (const chunk of response.body!) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
          const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
          events.push({ event, data: data ? JSON.parse(data) as Record<string, any> : {} })
          for (const wake of waiting.splice(0)) wake()
        }
      }
    } catch {
    }
  })()
  const post = async (body: Record<string, unknown>) => {
    const answer = await fetch(control, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: id, ...body }) })
    await answer.text()
    return answer.status
  }
  return {
    async next(event, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const index = events.findIndex(e => e.event === event)
        if (index >= 0) return events.splice(index, 1)[0]!.data
        if (Date.now() > deadline) throw new Error(`no ${event} event within ${timeoutMs} ms; got ${JSON.stringify(events)}`)
        await new Promise<void>((resolve) => {
          waiting.push(resolve)
          setTimeout(resolve, 200)
        })
      }
    },
    report: body => post({ type: 'report', ...body }),
    answer: (approval, allow) => post({ type: 'answer', id: approval, allow }),
    close: () => abort.abort(),
  }
}
