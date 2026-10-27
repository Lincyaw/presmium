import { DOCUMENT_VOICE_TASKS } from '@lincyaw/kernel'
import type { DocumentVoiceTasks, ServerContribution } from '@lincyaw/kernel'
import { createVoiceoverOwner, createVoiceoverRoutes } from '@lincyaw/kernel/node'
import { voiceoverExecution } from '../voiceover-execution.ts'
import type { ServedDeck } from './served-deck.ts'

/** Workspace contributions borrow its owner; standalone servers own the same coordinator factory. */
export function voiceoverRoutes(served: ServedDeck): ServerContribution {
  const borrowed = served.ctx.service(DOCUMENT_VOICE_TASKS)
  if (borrowed) return { routes: createVoiceoverRoutes(borrowed) }
  const owner = createVoiceoverOwner(), execution = voiceoverExecution(served.ctx), load = async () => execution
  const service: DocumentVoiceTasks = {
    snapshot: (_document, query, _member, signal) => owner.snapshot(query, load, signal),
    listJobs: async document => ({ document, jobs: owner.list().map(job => ({ ...job, current: 'unknown' as const })), idempotency: 'process', limits: owner.limits }),
    getJob: async (_document, query) => ({ ...owner.get(query), current: 'unknown' }),
    start: (_document, request, _member, signal) => owner.start(request, load, signal),
    cancel: async (_document, query) => owner.cancel(query),
    quotePreview: (_document, query, _member, signal) => owner.quote(query, load, signal),
    preview: (_document, request, _member, signal) => owner.preview(request, signal),
    readPreview: async (_document, id) => owner.readPreview(id),
  }
  return { routes: createVoiceoverRoutes(service), close: () => owner.close() }
}
