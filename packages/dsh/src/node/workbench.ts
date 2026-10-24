import type { DshContext, DshOtelScalar } from './dsh-types.ts'
import type { OperationClient, OperationRecord, PresmiumTelemetry } from './telemetry.ts'

export const name = 'presmium-workbench'
export const inject = ['presmium', 'connection', 'webServer', 'presmiumTelemetry']

const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0F5F5C"/><path d="M11 8h7.5a6.5 6.5 0 0 1 0 13H15v4h-4zM15 12v5h3.5a2.5 2.5 0 0 0 0-5z" fill="#F7F5F0" fill-rule="evenodd"/></svg>')}`

export function brandIndex(html: string): string {
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>Presmium</title>')
    .replace(/<link rel="(?:icon|manifest)"[^>]*>\s*/g, '')
    .replace('</head>', `<link rel="icon" type="image/svg+xml" href="${ICON}" />\n</head>`)
}

interface WebServer {
  tapIndex(transform: (html: string) => string): () => void
}

const OPERATION = /^[a-z][a-z0-9.-]{0,63}$/
const RECORDS = 500
const ATTRIBUTES = 64
const TEXT = 100_000

const text = (value: unknown, limit: number): string | undefined => (typeof value === 'string' && value ? value.slice(0, limit) : undefined)

/** The page's report of the author's operations, kept to names, times and scalar attributes of bounded size. */
export function readOperations(body: unknown): { client: OperationClient, records: OperationRecord[] } | undefined {
  if (!body || typeof body !== 'object') return undefined
  const { client, records } = body as { client?: Record<string, unknown>, records?: unknown }
  const id = text(client?.id, 64)
  if (!id || !Array.isArray(records) || records.length > RECORDS) return undefined
  const read: OperationRecord[] = []
  for (const record of records as Record<string, unknown>[]) {
    if (!record || typeof record.name !== 'string' || !OPERATION.test(record.name) || typeof record.time !== 'number' || typeof record.seq !== 'number') return undefined
    const attributes: Record<string, DshOtelScalar> = {}
    for (const [key, value] of Object.entries(record.attributes ?? {}).slice(0, ATTRIBUTES)) {
      if (typeof value === 'string') attributes[key.slice(0, 128)] = value.slice(0, TEXT)
      else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') attributes[key.slice(0, 128)] = value
    }
    read.push({ name: record.name, time: record.time, seq: record.seq, attributes })
  }
  const browser = text(client?.browser, 64)
  const locale = text(client?.locale, 32)
  return { client: { id, ...browser ? { browser } : {}, ...locale ? { locale } : {} }, records: read }
}

export function apply(ctx: DshContext & { webServer: WebServer, presmiumTelemetry: PresmiumTelemetry }): void {
  ctx.effect(() => ctx.webServer.tapIndex(brandIndex))
  ctx.connection.fetch.register({
    path: '/api/presmium/context', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const body = await request.json().catch(() => null) as { session?: unknown, document?: unknown } | null
      if (!body || typeof body.session !== 'string' || !body.session || (body.document !== null && typeof body.document !== 'string')) return new Response('Invalid context', { status: 400 })
      try {
        await ctx.presmium.bindings.selectDocument(body.session, body.document)
        return Response.json({ session: body.session, document: body.document })
      } catch {
        return new Response('Unknown document', { status: 400 })
      }
    },
  })
  // The workbench's operations, for the operator's collector: the page learns whether to record them, then sends them in batches.
  ctx.connection.fetch.register({
    path: '/api/presmium/telemetry',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const telemetry = ctx.presmiumTelemetry
      if (request.method === 'GET') return Response.json({ enabled: telemetry.enabled })
      if (!telemetry.enabled) return new Response(null, { status: 204 })
      const read = readOperations(await request.json().catch(() => null))
      if (!read) return new Response('Invalid operations', { status: 400 })
      telemetry.operations(read.client, read.records)
      return new Response(null, { status: 204 })
    },
  })
  ctx.connection.fetch.register({
    path: '/api/presmium/workbench',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const { url, root } = await ctx.presmium.server.ready
      return new Response(JSON.stringify({ mcp: `${url}/mcp`, root }), { headers: { 'Content-Type': 'application/json' } })
    },
  })
}
