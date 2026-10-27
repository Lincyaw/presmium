import { createHash } from 'node:crypto'
import { jsonResponse, prepareTranscriptionAdoption, ProductionAudioRefusal } from '@lincyaw/kernel'
import { validateTranscriptionAdoptionApply, validateTranscriptionAdoptionDraft } from '@lincyaw/kernel/node'
import type { CanonicalSource, DocumentChange, DocumentTranscriptionAdoption, DocumentTranscriptions, Member, Route, TranscriptionAdoptionAnswer, TranscriptionAdoptionApply, TranscriptionAdoptionDraft, TranscriptionAdoptionPlan } from '@lincyaw/kernel'
import type { DocumentEditor } from './document-authoring.ts'
import { catchRequestErrors, RequestError } from './errors.ts'

interface Receipt { document: string, member: string, key: string, draft: Pick<TranscriptionAdoptionDraft, 'source' | 'candidate' | 'draftRevision'>, change: DocumentChange, expires: number, bytes: number, applied: boolean }
const sameSource = (a: CanonicalSource, b: CanonicalSource) => a.documentId === b.documentId && a.version === b.version && a.fingerprint === b.fingerprint
const sameCandidate = (a: { id: string, revision: string }, b: { id: string, revision: string }) => a.id === b.id && a.revision === b.revision
const stable = (value: unknown): string => JSON.stringify(value, (_, child) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)

/** One preview and the existing document transaction, with separate trusted-editor and agent write paths. */
export function createTranscriptionAdoption({ documentEditor, transcriptions }: { documentEditor: DocumentEditor, transcriptions: DocumentTranscriptions }): { service: DocumentTranscriptionAdoption, routes: Record<string, Route>, close(): void } {
  const receipts = new Map<string, Receipt>(), latest = new Map<string, { revision: number, digest: string }>()
  let bytes = 0, closed = false
  const available = () => { if (closed) throw new RequestError(503, 'adoption-closed') }
  const assertLatest = (receipt: Receipt) => {
    available()
    if (latest.get(receipt.key)?.revision !== receipt.draft.draftRevision) throw new RequestError(409, 'adoption-draft-changed')
  }
  const apply = async (document: string, raw: TranscriptionAdoptionApply, member: Member, origin: 'editor' | 'agent'): Promise<TranscriptionAdoptionAnswer> => {
    available()
    if (!validateTranscriptionAdoptionApply(raw)) throw new RequestError(400, 'adoption-request-invalid')
    const receipt = receipts.get(raw.planId)
    if (!receipt || receipt.document !== document || receipt.member !== member.id) throw new RequestError(409, 'adoption-plan-missing')
    if (raw.draftRevision !== receipt.draft.draftRevision || !sameSource(raw.source, receipt.draft.source) || !sameCandidate(raw.candidate, receipt.draft.candidate)) throw new RequestError(409, 'adoption-plan-changed')
    assertLatest(receipt)
    if (!receipt.applied) {
      if (Date.now() > receipt.expires) throw new RequestError(409, 'adoption-plan-expired')
      await transcriptions.verifyResult(document, raw.candidate.id, raw.candidate.revision, raw.source, member)
      assertLatest(receipt)
    }
    // Origin is selected by the host closure. No request field can choose the editor path.
    const answer = origin === 'agent'
      ? await documentEditor.apply(document, { planId: raw.planId, change: receipt.change }, member)
      : await documentEditor.change(document, receipt.change, member)
    receipt.applied = true
    return { ...answer, adoption: { planId: raw.planId, candidate: structuredClone(raw.candidate), draftRevision: raw.draftRevision } }
  }
  const service: DocumentTranscriptionAdoption = {
    async plan(document, raw, member) {
      available()
      if (!validateTranscriptionAdoptionDraft(raw)) throw new RequestError(400, 'adoption-draft-invalid')
      if (Buffer.byteLength(JSON.stringify(raw)) > 2 << 20) throw new RequestError(413, 'adoption-draft-size')
      const draft = structuredClone(raw), key = JSON.stringify([document, member.id, draft.id]), digest = createHash('sha256').update(stable(draft)).digest('hex')
      const previous = latest.get(key)
      if (previous && (previous.revision > draft.draftRevision || previous.revision === draft.draftRevision && previous.digest !== digest)) throw new RequestError(409, 'adoption-draft-changed')
      latest.set(key, { revision: draft.draftRevision, digest })
      while (latest.size > 128) latest.delete(latest.keys().next().value!)
      const current = await documentEditor.read(document, member)
      if (!sameSource({ documentId: current.content.id, version: current.version, fingerprint: current.fingerprint }, draft.source)) throw new RequestError(409, 'document-version-changed')
      const candidate = await transcriptions.verifyResult(document, draft.candidate.id, draft.candidate.revision, draft.source, member)
      const prepared = prepareTranscriptionAdoption(current.content, candidate, draft)
      const response: TranscriptionAdoptionPlan = { document, changeId: draft.id, source: draft.source, candidate: draft.candidate, draftRevision: draft.draftRevision, ...prepared }
      if (prepared.conflicts.length || !prepared.content) return response
      if (latest.get(key)?.revision !== draft.draftRevision) throw new RequestError(409, 'adoption-draft-changed')
      const change: DocumentChange = { id: draft.id, baseDocumentVersion: draft.source.version, replacement: prepared.content }
      const plan = await documentEditor.plan(document, change, member)
      available()
      if (latest.get(key)?.revision !== draft.draftRevision) throw new RequestError(409, 'adoption-draft-changed')
      const size = Buffer.byteLength(JSON.stringify(change))
      receipts.set(plan.planId, { document, member: member.id, key, draft: { source: draft.source, candidate: draft.candidate, draftRevision: draft.draftRevision }, change, expires: Date.parse(plan.expiresAt), bytes: size, applied: false })
      bytes += size
      while (receipts.size > 64 || bytes > 16 << 20) { const id = receipts.keys().next().value!; bytes -= receipts.get(id)!.bytes; receipts.delete(id) }
      return { ...response, planId: plan.planId, expiresAt: plan.expiresAt, content: plan.content }
    },
    apply: (document, request, member) => apply(document, request, member, 'agent'),
  }
  const guarded = (run: () => Promise<unknown>) => catchRequestErrors(async () => {
    try { return jsonResponse(await run()) }
    catch (error) { if (error instanceof ProductionAudioRefusal) throw new RequestError(error.status, error.code); throw error }
  })
  return {
    service,
    routes: {
      'document/transcription/adoption/plan': { role: 'editor', maxBody: 2 << 20, handle: (request, ctx) => guarded(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        return service.plan(ctx.document, await request.json().catch(() => undefined), ctx.member)
      }) },
      'document/transcription/adoption/apply': { role: 'editor', maxBody: 8 << 10, handle: (request, ctx) => guarded(async () => {
        if (request.method !== 'POST') throw new RequestError(405, 'POST')
        return apply(ctx.document, await request.json().catch(() => undefined), ctx.member, 'editor')
      }) },
    },
    close() { closed = true; receipts.clear(); latest.clear(); bytes = 0 },
  }
}
