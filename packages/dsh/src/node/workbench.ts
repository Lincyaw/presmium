import type { DshContext } from './dsh-types.ts'

export const name = 'presmium-workbench'
export const inject = ['presmium', 'connection', 'webServer']

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

export function apply(ctx: DshContext & { webServer: WebServer }): void {
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
