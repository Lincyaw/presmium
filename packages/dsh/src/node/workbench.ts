/**
 * The `presmium-workbench` row, web carrier only (docs/design-dsh.md 6.2 and 7.5):
 * the host half of the workbench, whose client half is this package's `./client`
 * (src/client, built by build/client.mjs). The page's title and icon are
 * Presmium's (`ctx.webServer.tapIndex`; the shipped index names DeepSeek Harness
 * and links its web manifest), and the page asks this row where the workspace
 * service's MCP is (`/api/presmium/workbench`, behind the host's cookie), which
 * the home page shows outside agents.
 */
import type { DshContext } from './dsh.ts'

export const name = 'presmium-workbench'
export const inject = ['presmium', 'connection', 'webServer']

/** Presmium's mark: a P of paper on the accent (src/client/brand.tsx draws the same). */
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0F5F5C"/><path d="M11 8h7.5a6.5 6.5 0 0 1 0 13H15v4h-4zM15 12v5h3.5a2.5 2.5 0 0 0 0-5z" fill="#F7F5F0" fill-rule="evenodd"/></svg>')}`

/** The index with Presmium's title and icon, and without DeepSeek Harness's manifest. */
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
    path: '/api/presmium/workbench',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const { url } = await ctx.presmium.ready
      return new Response(JSON.stringify({ mcp: `${url}/mcp` }), { headers: { 'Content-Type': 'application/json' } })
    },
  })
}
