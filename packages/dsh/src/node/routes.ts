/**
 * The `presmium-routes` row, web carrier only (docs/design-dsh.md 2.3 and
 * 6.2): the workbench's data. The page calls DeepSeek Harness's own host at
 * `/api/presmium/<path>`, behind its cookie and its `Host` and `Origin`
 * fence; this row passes each request on to the workspace service over the
 * loopback with the service token, and the answer back as it streams. The
 * routes are exact (DeepSeek Harness has no prefix routes on this carrier),
 * one per route of the service the workbench uses (5.1); a session token is
 * not among them, it is the bundle's.
 */
import type { DshContext } from './dsh.ts'

export const name = 'presmium-routes'
export const inject = ['presmium', 'connection']

const WORKSPACE = '/__presmium/presmium.workspace/'
const SERVER = '/__presmium/presmium.server/'

/** The paths below `/api/presmium/`, and where each goes in the workspace service. */
export const ROUTES: Record<string, string> = Object.fromEntries([
  ...['documents', 'files', 'source', 'changes', 'changes/commit', 'changes/discard', 'revisions', 'revisions/revert',
    'ir', 'ir/events', 'preview', 'build', 'check',
    'review', 'review/open', 'review/step', 'review/accept', 'review/reject', 'review/restore'].map(path => [path, `${WORKSPACE}${path}`]),
  ['focus', `${SERVER}focus`],
])

/** The request headers passed on: what the service reads of a request. */
const PASSED = ['accept', 'content-type', 'presmium-document', 'last-event-id']
/** The response headers passed back. */
const RETURNED = ['content-type', 'cache-control', 'content-disposition', 'x-accel-buffering']

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
