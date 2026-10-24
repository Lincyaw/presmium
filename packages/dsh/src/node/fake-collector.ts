import { createServer } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gunzipSync } from 'node:zlib'

// An OTLP/HTTP JSON logs collector for tests: what the bundle's telemetry sends, decoded.

/** One log record as an OTLP/HTTP JSON collector receives it, with its resource and the request's headers. */
export interface Logged {
  eventName?: string
  body?: unknown
  attributes: Record<string, unknown>
  resource: Record<string, unknown>
  headers: IncomingHttpHeaders
}

type AnyValue = { stringValue?: string, intValue?: string | number, doubleValue?: number, boolValue?: boolean, kvlistValue?: { values?: KeyValue[] } }
type KeyValue = { key: string, value: AnyValue }

const value = (v: AnyValue | undefined): unknown => v === undefined ? undefined
  : v.stringValue ?? (v.intValue !== undefined ? Number(v.intValue) : undefined) ?? v.doubleValue ?? v.boolValue
    ?? (v.kvlistValue ? Object.fromEntries((v.kvlistValue.values ?? []).map(kv => [kv.key, value(kv.value)])) : undefined)
const attributes = (list: KeyValue[] | undefined) => Object.fromEntries((list ?? []).map(kv => [kv.key, value(kv.value)]))

/** A collector that keeps every record it is sent. */
export async function fakeCollector(): Promise<{ url: string, logged: Logged[], close(): Promise<void> }> {
  const logged: Logged[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      const body = JSON.parse((req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8')) as { resourceLogs?: { resource?: { attributes?: KeyValue[] }, scopeLogs?: { logRecords?: { eventName?: string, body?: AnyValue, attributes?: KeyValue[] }[] }[] }[] }
      for (const resourceLog of body.resourceLogs ?? []) {
        for (const scopeLog of resourceLog.scopeLogs ?? []) {
          for (const record of scopeLog.logRecords ?? []) {
            logged.push({ eventName: record.eventName, body: value(record.body), attributes: attributes(record.attributes), resource: attributes(resourceLog.resource?.attributes), headers: req.headers })
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
    })
  })
  const port = await new Promise<number>(done => server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port)))
  return { url: `http://127.0.0.1:${port}`, logged, close: () => new Promise<void>(done => server.close(() => done())) }
}
