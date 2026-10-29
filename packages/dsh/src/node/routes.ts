import type { DshContext } from './dsh-types.ts'
import { SERVER_ROUTES, WORKSPACE_ROUTES } from './server-routes.ts'

export const name = 'presmium-routes'
export const inject = ['presmium', 'connection']

export const ROUTES: Record<string, string> = Object.fromEntries([
  ...['project/capabilities', 'project/plan', 'project/apply', 'documents', 'document', 'document/capabilities', 'document/outline', 'document/part', 'document/page/plan', 'document/page/apply', 'document/action/plan', 'document/action/impact', 'document/action/apply', 'document/asset', 'document/events', 'document/change', 'document/image', 'document/audio', 'document/recording/adopt', 'document/media-clip', 'files', 'source', 'source/create', 'source/transaction', 'changes', 'changes/commit', 'changes/discard', 'revisions', 'revisions/revert', 'history/list', 'history/file', 'history/undo', 'history/redo',
    'document/media-clip/validate', 'document/transcription/capabilities', 'document/transcription', 'document/transcription/result', 'document/transcription/cancel',
    'document/transcription/adoption/plan', 'document/transcription/adoption/apply',
    'ir', 'ir/events', 'preview', 'build', 'check', 'jobs', 'jobs/cancel', 'jobs/events', 'voice-catalog', 'voice-capabilities',
    'review', 'review/open', 'review/step', 'review/accept', 'review/reject', 'review/restore'].map(path => [path, `${WORKSPACE_ROUTES}${path}`]),
  ['focus', `${SERVER_ROUTES}focus`],
  ['control', `${SERVER_ROUTES}control`],
  ['diagnostics', `${SERVER_ROUTES}diagnostics`],
  ['diagnostics/events', `${SERVER_ROUTES}diagnostics/events`],
  ['diagnostics/authoring', `${SERVER_ROUTES}diagnostics/authoring`],
  ...['voiceover', 'voiceover/jobs', 'voiceover/job', 'voiceover/cancel', 'voice-preview', 'voice-preview/media', 'production-plan', 'production-media', 'production-asset'].map(path => [path, `/__presmium/presmium.lecture/${path}`]),
  // Training a cloned voice and its status: the speech plugin's owner routes.
  ['voice-clone', '/__presmium/presmium.speech/clone'],
  ['voice-clone/status', '/__presmium/presmium.speech/clone/status'],
])

const PASSED = ['accept', 'content-type', 'presmium-document', 'last-event-id', 'if-none-match']
const RETURNED = ['content-type', 'cache-control', 'content-disposition', 'content-security-policy', 'x-content-type-options', 'cross-origin-resource-policy', 'x-accel-buffering', 'etag', 'retry-after']

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
        const upstream = await ctx.presmium.server.request(`${target}${new URL(request.url).search}`, {
          method: request.method,
          headers,
          ...request.method === 'POST' ? { raw: await request.arrayBuffer() } : {},
          signal: request.signal,
        })
        if ((path === 'documents' || path === 'project/apply') && request.method === 'POST' && upstream.ok) ctx.presmium.server.invalidateDocuments()
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
