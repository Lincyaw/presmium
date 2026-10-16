// A Messages-compatible model service for the tests (the operator's PRESMIUM_MODEL_URL): it answers each
// `POST /v1/messages` with the next step of its script as an SSE stream (a text, or a tool call), records
// what it received, and can hold its answers until the test lets them go. Not a mock of DeepSeek Harness:
// the real one talks to it over HTTP, as it would to a model.
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
  /** From now on, answers wait until `release`. */
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
        // Not JSON.
      }
      received.push({ path: req.url ?? '', headers: req.headers, body: parsed })
      if (req.method !== 'POST' || !(req.url ?? '').endsWith('/v1/messages')) {
        res.writeHead(404).end()
        return
      }
      await held
      const n = received.filter(r => r.path.endsWith('/v1/messages')).length
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(stream(script[n - 1] ?? { text: '完毕。' }, n))
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

/** A forward proxy that only records who tried to go through it (CONNECT or a plain request) and lets nothing through. */
export async function recordingProxy(): Promise<{ url: string, attempts: string[], close(): Promise<void> }> {
  const attempts: string[] = []
  const server = createServer((req, res) => {
    attempts.push(`${req.method} ${req.url}`)
    res.writeHead(502).end()
  })
  server.on('connect', (req, socket) => {
    attempts.push(`CONNECT ${req.url}`)
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
  })
  const port = await new Promise<number>(done => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)))
  return {
    url: `http://127.0.0.1:${port}`,
    attempts,
    close: () => new Promise<void>((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}
