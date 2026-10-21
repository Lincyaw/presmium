import type { DshContext } from './dsh.ts'

export const name = 'presmium-routes'
export const inject = ['presmium', 'connection']

const WORKSPACE = '/__presmium/presmium.workspace/'
const SERVER = '/__presmium/presmium.server/'

export const ROUTES: Record<string, string> = Object.fromEntries([
  ...['documents', 'files', 'source', 'changes', 'changes/commit', 'changes/discard', 'revisions', 'revisions/revert',
    'ir', 'ir/events', 'preview', 'build', 'check',
    'review', 'review/open', 'review/step', 'review/accept', 'review/reject', 'review/restore'].map(path => [path, `${WORKSPACE}${path}`]),
  ['focus', `${SERVER}focus`],
])

const PASSED = ['accept', 'content-type', 'presmium-document', 'last-event-id', 'if-none-match']
const RETURNED = ['content-type', 'cache-control', 'content-disposition', 'x-accel-buffering', 'etag']

export function apply(ctx: DshContext): void {
  for (const [path, target] of Object.entries(ROUTES)) {
    ctx.connection.fetch.register({
      path: `/api/presmium/${path}`,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const headers: Record<string, string> = {}
        for (const name of PASSED) {
          const value = request.headers.get(name)
          if (value !== null) headers[name] = value
        }
        const upstream = await ctx.presmium.request(`${target}${new URL(request.url).search}`, {
          method: request.method,
          headers,
          ...request.method === 'POST' ? { raw: await request.arrayBuffer() } : {},
          signal: request.signal,
        })
        const answered = new Headers()
        for (const name of RETURNED) {
          const value = upstream.headers.get(name)
          if (value !== null) answered.set(name, value)
        }
        return new Response(upstream.body, { status: upstream.status, headers: answered })
      },
    })
  }
}
