/**
 * The model relay of a SHARED session, in agent-host: DeepSeek Harness's
 * DeepSeek adapter sends its key as `x-api-key`, and the gateway takes a
 * token only as `Authorization: Bearer` (10.9). The relay, on this machine's
 * loopback, forwards the adapter's Messages requests under the gateway's
 * model proxy with the key it was given (the session's scoped token) as the
 * bearer token. It holds no credential of its own: a request without a key
 * reaches nothing.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { errorMessage } from '@presmium/kernel'
import type { GatewayAccess } from '@presmium/kernel'
import { MODEL_PATH } from '../domain/index.ts'

/** Request headers a Messages request keeps on its way. */
const KEPT = ['content-type', 'accept', 'anthropic-version', 'anthropic-beta']

export interface ModelRelay {
  /** What DeepSeek Harness gets as `DEEPSEEK_BASE_URL`. */
  url: string
  close(): Promise<void>
}

export async function modelRelay(gateway: GatewayAccess): Promise<ModelRelay> {
  const target = gateway.url.replace(/\/+$/, '')
  const server = createServer((req, res) => {
    const key = req.headers['x-api-key']
    if (typeof key !== 'string' || !key || !(req.url ?? '').startsWith(`/${MODEL_PATH}/`)) {
      res.writeHead(404).end()
      return
    }
    const headers: Record<string, string> = { authorization: `Bearer ${key}` }
    for (const name of KEPT) {
      const value = req.headers[name]
      if (typeof value === 'string') headers[name] = value
    }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req) as ReadableStream<Uint8Array>
    fetch(`${target}${req.url}`, { method: req.method, headers, redirect: 'error', ...body ? { body, duplex: 'half' } as RequestInit : {} })
      .then((response) => {
        const type = response.headers.get('content-type')
        res.writeHead(response.status, type ? { 'content-type': type } : {})
        if (!response.body) return res.end()
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res)
      })
      .catch((error: unknown) => {
        if (res.headersSent) res.destroy()
        else res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: errorMessage(error) }))
      })
  })
  const port = await new Promise<number>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port))
  })
  return {
    url: `http://127.0.0.1:${port}/${MODEL_PATH}`,
    close: () => new Promise<void>((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}
