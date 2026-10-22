import { createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export type Step = { text: string } | { tool: string, input: Record<string, unknown> }

export interface Received {
  path: string
  headers: IncomingHttpHeaders
  body: Record<string, any>
}

export interface FakeModel {
  url: string
  received: Received[]
  hold(): void
  release(): void
  close(): Promise<void>
}

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

function stream(step: Step, n: number): string {
  const start = { type: 'message_start', message: { id: `msg_${n}`, type: 'message', role: 'assistant', model: 'fake-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }
  const block = 'text' in step
    ? [event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }), event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: step.text } })]
    : [event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${n}`, name: step.tool, input: {} } }), event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(step.input) } })]
  return [
    event('message_start', start),
    ...block,
    event('content_block_stop', { type: 'content_block_stop', index: 0 }),
    event('message_delta', { type: 'message_delta', delta: { stop_reason: 'text' in step ? 'end_turn' : 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }),
    event('message_stop', { type: 'message_stop' }),
  ].join('')
}

export async function fakeModel(script: Step[]): Promise<FakeModel> {
  const received: Received[] = []
  let held: Promise<void> | undefined
  let release = () => {}
  const server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8').on('data', (chunk: string) => body += chunk)
    req.on('end', async () => {
      let parsed: Record<string, any> = {}
      try {
        parsed = JSON.parse(body) as Record<string, any>
      } catch {
      }
      const record: Received = { path: req.url ?? '', headers: req.headers, body: parsed }
      received.push(record)
      if (req.method !== 'POST' || !(req.url ?? '').endsWith('/v1/messages')) {
        res.writeHead(404).end()
        return
      }
      await held
      const turn = (r: Received) => r.path.endsWith('/v1/messages') && Array.isArray(r.body.tools) && r.body.tools.length > 0
      const n = received.filter(r => r.path.endsWith('/v1/messages')).length
      const step = turn(record) ? script[received.filter(turn).indexOf(record)] ?? { text: '完毕。' } : { text: 'Presmium' }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(stream(step, n))
    })
  })
  const port = await new Promise<number>(done => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)))
  return {
    url: `http://127.0.0.1:${port}`,
    received,
    hold() {
      held = new Promise(done => release = done)
    },
    release() {
      release()
      held = undefined
    },
    close: () => new Promise<void>((done) => {
      release()
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}
