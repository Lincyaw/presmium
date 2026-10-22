// An OpenAI-compatible Chat Completions service on this machine for the end-to-end tests of readers' questions
//: what a reader fills in as his own model service. It answers `POST <base>/chat/completions` with the
// pieces `answer` gives for the request, streamed as server-sent events (`data: {choices:[{delta}]}`, then
// `[DONE]`), allows a page of any origin to call it (CORS, its preflight too), records what it received, and
// can hold the rest of an answer after its first piece until the test lets it go. Not a model: the browser
// talks to it over HTTP, as it would to one.
import { createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface ChatRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: { model?: string, stream?: boolean, messages?: { role: string, content: string }[] }
}

export interface ChatStub {
  /** The service's base address, as a reader fills it in (`…/v1`). */
  url: string
  received: ChatRequest[]
  /** From now on, an answer stops after its first piece until `release`. */
  hold(): void
  release(): void
  close(): Promise<void>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept',
}

/** The question of a request: its last user message. */
export const questionOf = (request: ChatRequest) => request.body.messages?.findLast(m => m.role === 'user')?.content ?? ''

export async function chatStub(answer: (request: ChatRequest) => string[], options: { multiline?: boolean } = {}): Promise<ChatStub> {
  const received: ChatRequest[] = []
  let held: Promise<void> | undefined
  let release = () => {}
  const server = createServer((req, res) => {
    let text = ''
    req.setEncoding('utf8').on('data', (chunk: string) => text += chunk)
    req.on('end', async () => {
      let body: ChatRequest['body'] = {}
      try {
        body = JSON.parse(text) as ChatRequest['body']
      } catch {
        // Not JSON (a preflight has no body).
      }
      const request: ChatRequest = { method: req.method ?? '', path: req.url ?? '', headers: req.headers, body }
      received.push(request)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...CORS, 'Access-Control-Max-Age': '0' }).end()
        return
      }
      if (req.method !== 'POST' || !request.path.endsWith('/v1/chat/completions')) {
        res.writeHead(404, CORS).end()
        return
      }
      const [first = '', ...rest] = answer(request)
      const piece = (content: string) => {
        const data = JSON.stringify({ id: 'chatcmpl-stub', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { content } }] })
        return options.multiline ? `: heartbeat\rdata: ${data.replace(',"choices":', ',\rdata: "choices":')}\r\r` : `data: ${data}\n\n`
      }
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
      res.write(piece(first))
      await held
      for (const content of rest) res.write(piece(content))
      res.end('data: [DONE]\n\n')
    })
  })
  const port = await new Promise<number>(done => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)))
  return {
    url: `http://127.0.0.1:${port}/v1`,
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
