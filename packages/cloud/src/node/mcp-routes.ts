import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMcpToolHandler } from '@lincyaw/mcp'
import type { RemoteMcpTool } from '@lincyaw/mcp'
import { documentOutline, documentPart, DocumentReadError, DOCUMENT_OUTLINE_QUERY_SCHEMA, DOCUMENT_PART_QUERY_SCHEMA } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentOutlineQuery, DocumentPartQuery } from '@lincyaw/kernel'
import { DOCUMENT_CHANGE_JSON_SCHEMA, validateDocumentOutlineQuery, validateDocumentPartQuery } from '@lincyaw/kernel/node'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import type { CloudCapability, Membership } from '../domain/plans.ts'
import type { AuthService } from './auth.ts'
import type { Documents } from './documents.ts'
import type { Spaces } from './spaces.ts'
import type { Usage } from './usage.ts'
import type { Admission } from './admission.ts'
import type { RuntimeClient } from './runtime-http.ts'
import type { RuntimeContext, RuntimeProfile } from './environments.ts'
import type { RuntimeJobView } from './runner.ts'
import type { ObjectStorage } from './storage.ts'

export interface CloudMcpOptions {
  auth: AuthService, spaces: Spaces, documents: Documents, usage: Usage, publicUrl: string,
  admission?: Admission, runtime?: Pick<RuntimeClient, 'call'>, profiles?: readonly RuntimeProfile[], storage?: ObjectStorage,
}
const idProperty = { type: 'string', format: 'uuid' }
const documentProperty = { ...idProperty, description: 'The cloud document UUID returned by list_documents in this space.' }
const schema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties, required })
const changeSchema = (apply = false): Record<string, unknown> => ({
  ...schema({ document: documentProperty, change: { $ref: '#/$defs/DocumentChange' }, ...apply ? { planId: idProperty } : {} }, apply ? ['document', 'change', 'planId'] : ['document', 'change']),
  $defs: (structuredClone(DOCUMENT_CHANGE_JSON_SCHEMA) as { $defs: Record<string, unknown> }).$defs,
})
const sourceOf = (answer: Awaited<ReturnType<Documents['read']>>): CanonicalSource => ({ documentId: answer.content.id, version: answer.version, fingerprint: answer.fingerprint })
function assertSource(expected: CanonicalSource | undefined, actual: CanonicalSource, required = false): void {
  if ((required && !expected) || (expected && (expected.documentId !== actual.documentId || expected.version !== actual.version || expected.fingerprint !== actual.fingerprint))) throw new CloudError(409, 'document-version-changed', { source: actual })
}

/** Each HTTP request and each tool call resolves the current membership and PAT scope again. */
export function registerCloudMcpRoutes(app: Hono, options: CloudMcpOptions): { close(): Promise<void> } {
  const publicUrl = new URL(options.publicUrl)
  const active = new Set<ReturnType<typeof createMcpToolHandler>>()
  const resource = (spaceId: string) => new URL(`/mcp/${spaceId}`, publicUrl).href
  const metadata = (spaceId: string) => new URL(`/.well-known/oauth-protected-resource/mcp/${spaceId}`, publicUrl).href
  app.get('/.well-known/oauth-protected-resource/mcp/:sid', c => {
    const spaceId = requireId(c.req.param('sid'))
    c.header('Cache-Control', 'public, max-age=300')
    c.header('Access-Control-Allow-Origin', '*')
    return c.json(options.auth.metadata(resource(spaceId)))
  })
  app.use('/mcp/*', bodyLimit({ maxSize: 3 << 20, onError: c => c.json({ error: 'request-too-large' }, 413) }))
  app.all('/mcp/:sid', async c => {
    const spaceId = requireId(c.req.param('sid'))
    const request = c.req.raw
    const fail = (error: unknown): Response => {
      const known = error instanceof CloudError ? error : new CloudError(503, 'service-unavailable')
      return new Response(JSON.stringify({ error: known.code }), {
        status: known.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...known.status === 401 ? { 'WWW-Authenticate': `Bearer resource_metadata="${metadata(spaceId)}"` } : {} },
      })
    }
    try {
      if (new URL(request.url).host !== publicUrl.host || (request.headers.has('origin') && request.headers.get('origin') !== publicUrl.origin)) throw new CloudError(403, 'mcp-origin-invalid')
      const matched = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')
      if (!matched || matched[1]!.length > 32_768) throw new CloudError(401, 'auth-required')
      const secret = matched[1]!
      const authorize = async (capability: CloudCapability): Promise<Membership> => {
        if (secret.startsWith('pmc_')) return options.spaces.token(secret, spaceId, capability)
        const user = await options.auth.requireUser(request)
        return options.spaces.authorize(user.id, spaceId, capability)
      }
      await authorize('read')
      let writable = false
      try { await authorize('write'); writable = true } catch (error) { if (!(error instanceof CloudError && [401, 403, 404].includes(error.status))) throw error }
      const read = async (args: Record<string, unknown>) => {
        const member = await authorize('read')
        return options.documents.read(member.userId, spaceId, requireId(args.document))
      }
      const authorizedContext = async (...capabilities: CloudCapability[]): Promise<RuntimeContext> => {
        let member = await authorize('read')
        for (const capability of capabilities) member = await authorize(capability)
        return { workspaceId: spaceId, userId: member.userId, billingAccountId: member.billingAccountId }
      }
      const capable = async (...capabilities: CloudCapability[]) => {
        try { await authorizedContext(...capabilities); return true }
        catch (error) { if (error instanceof CloudError && [401, 403, 404].includes(error.status)) return false; throw error }
      }
      const tools: RemoteMcpTool[] = [
        { name: 'list_documents', description: 'Lists saved cloud documents in the authorized space. Document identifiers are UUIDs.', inputSchema: schema(), readOnly: true,
          run: async () => { const member = await authorize('read'); return { documents: await options.documents.list(member.userId, spaceId) } } },
        { name: 'get_authoring_capabilities', description: 'Reports this cloud host’s durable source editing and retry boundary.', inputSchema: schema(), readOnly: true,
          run: async () => {
            await authorize('read')
            let write = false
            try { await authorize('write'); write = true } catch (error) { if (!(error instanceof CloudError && [401, 403, 404].includes(error.status))) throw error }
            return { documentSchemaVersion: 1, source: 'canonical-teaching-document', plan: write, apply: write, idempotency: 'persistent-request-id-and-payload', planLifetimeSeconds: 300, liveTextMerge: false, runtime: 'workspace-preparation', coreOperationsFree: true, hostedAiAvailable: false }
          } },
        { name: 'get_document', description: 'Reads canonical saved lecture.json with its exact source version and fingerprint. Use outline and part reads for larger documents.', inputSchema: schema({ document: documentProperty }, ['document']), readOnly: true,
          run: read },
        { name: 'get_document_outline', description: 'Reads a bounded canonical outline without compiling. Continue pages using the returned exact source.', inputSchema: { ...DOCUMENT_OUTLINE_QUERY_SCHEMA, properties: { ...DOCUMENT_OUTLINE_QUERY_SCHEMA.properties, document: documentProperty }, required: ['document'] }, readOnly: true,
          run: async args => {
            const { document: _document, ...raw } = args
            if (!validateDocumentOutlineQuery(raw)) throw new CloudError(400, 'document-outline-query-invalid')
            const query = raw as DocumentOutlineQuery
            const answer = await read(args), source = sourceOf(answer)
            assertSource(query.source, source, (query.offset ?? 0) > 0)
            return documentOutline(answer.content, source, query)
          } },
        { name: 'read_document_part', description: 'Reads an exact source-bound canonical entity or field. Fragmented JSON is explicitly marked and must be concatenated before parsing.', inputSchema: { ...DOCUMENT_PART_QUERY_SCHEMA, properties: { ...DOCUMENT_PART_QUERY_SCHEMA.properties, document: documentProperty }, required: ['document', ...DOCUMENT_PART_QUERY_SCHEMA.required] }, readOnly: true,
          run: async args => {
            const { document: _document, ...query } = args
            if (!validateDocumentPartQuery(query)) throw new CloudError(400, 'document-part-query-invalid')
            const answer = await read(args), source = sourceOf(answer)
            assertSource(query.source, source, true)
            return documentPart(answer.content, source, query as DocumentPartQuery)
          } },
        { name: 'get_document_history', description: 'Reads a stable page of persistent canonical history retained by this deployment. Continue with nextCursor; current saved content remains readable regardless of its age.', inputSchema: schema({ document: documentProperty, cursor: { type: 'string', minLength: 1, maxLength: 2048 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['document']), readOnly: true,
          run: async args => { const member = await authorize('read'); return options.documents.historyPage(member.userId, spaceId, requireId(args.document), { ...typeof args.cursor === 'string' ? { cursor: args.cursor } : {}, ...typeof args.limit === 'number' ? { limit: args.limit } : {} }) } },
        { name: 'get_document_version', description: 'Reads one immutable historical canonical document version and its project text files.', inputSchema: schema({ document: documentProperty, version: idProperty }, ['document', 'version']), readOnly: true,
          run: async args => { const member = await authorize('read'); return options.documents.snapshot(member.userId, spaceId, requireId(args.document), requireId(args.version)) } },
        { name: 'get_usage', description: 'Reads this space’s storage quota usage, actual stored object bytes, and disk capacity reserved for environments. Editing, preview, export, and code environments are free; hosted AI is unavailable.', inputSchema: schema(), readOnly: true,
          run: async () => { const member = await authorize('read'); const usage = await options.usage.read(member.billingAccountId); return { usage: { storageBytes: usage.storageBytes, objectBytes: usage.objectBytes, environmentReservedBytes: usage.environmentReservedBytes, coreOperationsFree: true, hostedAiAvailable: false } } } },
      ]
      if (writable) tools.push(
        { name: 'plan_document_change', description: 'Preflights a canonical semantic change or replacement with exact version and project-file bases. Review the returned plan before applying its unchanged change.', inputSchema: changeSchema(), readOnly: true, idempotent: true,
          run: async args => { const member = await authorize('write'); return options.documents.plan(member.userId, spaceId, requireId(args.document), args.change) } },
        { name: 'apply_document_change', description: 'Applies the unchanged change and planId returned by preflight, using durable CAS, receipts and history. Retry the same change ID and payload after a lost response.', inputSchema: changeSchema(true), readOnly: false, idempotent: true,
          run: async args => { const member = await authorize('write'); return options.documents.apply(member.userId, spaceId, requireId(args.document), requireId(args.planId), args.change) } },
        { name: 'plan_document_restore', description: 'Preflights restoration of historical canonical lecture.json content as a new revision. Current project files remain attached. Review then use apply_document_change with this returned change and planId.', inputSchema: schema({ document: documentProperty, version: idProperty, requestId: { type: 'string', minLength: 1, maxLength: 200 }, baseDocumentVersion: idProperty }, ['document', 'version', 'requestId', 'baseDocumentVersion']), readOnly: true, idempotent: true,
          run: async args => {
            const member = await authorize('write'), document = requireId(args.document)
            const previous = await options.documents.snapshot(member.userId, spaceId, document, requireId(args.version))
            const change = { id: requireText(args.requestId), baseDocumentVersion: requireId(args.baseDocumentVersion), replacement: previous.content }
            const plan = await options.documents.plan(member.userId, spaceId, document, change)
            return { ...plan, change, restoredContentOnly: true }
          } },
      )
      if (options.runtime && options.admission) {
        const runtime = options.runtime, admission = options.admission
        tools.push(
          { name: 'list_runtime_profiles', description: 'Lists operator-defined resource and finite runtime limits for free code environments and document preparation. Reading never starts work.', inputSchema: schema(), readOnly: true,
            run: async () => { await authorizedContext(); return { profiles: (options.profiles ?? []).map(profile => ({ id: profile.id, kind: profile.kind, cpu: profile.cpu, memoryBytes: profile.memoryBytes, diskBytes: profile.diskBytes, maxDurationSeconds: profile.maxDurationSeconds, free: true })) } } },
          { name: 'list_jobs', description: 'Lists jobs already submitted in this space, including state and immutable source version. Reading never creates a job.', inputSchema: schema(), readOnly: true,
            run: async () => ({ jobs: await runtime.call('jobs', { action: 'list', context: await authorizedContext() }) }) },
          { name: 'get_job', description: 'Reads the state and output manifest of an existing job.', inputSchema: schema({ job: idProperty }, ['job']), readOnly: true,
            run: async args => ({ job: await runtime.call('jobs', { action: 'get', context: await authorizedContext(), jobId: requireId(args.job) }) }) },
          { name: 'get_job_outputs', description: 'Reads the verified output manifest of an existing job. downloadPath requires an authorized browser session; PAT clients use read_job_output for bounded bytes. This call never executes user HTML.', inputSchema: schema({ job: idProperty }, ['job']), readOnly: true,
            run: async args => {
              const context = await authorizedContext(), job = await runtime.call<RuntimeJobView>('jobs', { action: 'get', context, jobId: requireId(args.job) })
              return { job: job.id, state: job.state, files: (job.output ?? []).map((file, index) => ({ index, path: file.path, bytes: file.bytes, sha256: file.sha256, downloadPath: `/api/spaces/${spaceId}/jobs/${job.id}/outputs/${index}` })) }
            } },
          { name: 'read_job_output', description: 'Reads at most 256 KiB of an authorized job output as inert base64. Continue with nextOffset; sha256 identifies the whole file. No HTML or script is executed.', inputSchema: schema({ job: idProperty, file: { type: 'integer', minimum: 0, maximum: 9999 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 262144 } }, ['job', 'file']), readOnly: true,
            run: async args => {
              const context = await authorizedContext(), job = await admission.outputs(context.userId, spaceId, requireId(args.job))
              const index = requireInteger(args.file, 'runtime-output-not-found', 0, 9999), file = job.output?.[index]
              const offset = requireInteger(args.offset ?? 0, 'runtime-output-range-invalid', 0), limit = requireInteger(args.limit ?? 65536, 'runtime-output-range-invalid', 1, 262144)
              if (!file?.key) throw new CloudError(404, 'runtime-output-not-found')
              if (offset > file.bytes) throw new CloudError(416, 'runtime-output-range-invalid')
              if (!options.storage) throw new CloudError(503, 'asset-storage-unavailable')
              if (file.key !== `spaces/${spaceId}/${file.sha256}`) throw new CloudError(422, 'runtime-output-integrity-failed')
              const object = await options.storage.get(spaceId, file.key), reader = object.body.getReader()
              try {
                if (object.bytes !== file.bytes || object.sha256 !== file.sha256) throw new CloudError(422, 'runtime-output-integrity-failed')
                const end = Math.min(file.bytes, offset + limit), chunks: Uint8Array[] = []
                let received = 0, taken = 0
                while (received < end) {
                  const next = await reader.read()
                  if (next.done) throw new CloudError(422, 'runtime-output-integrity-failed')
                  const start = Math.max(0, offset - received), finish = Math.min(next.value.length, end - received)
                  if (finish > start) { const chunk = next.value.subarray(start, finish); chunks.push(chunk); taken += chunk.length }
                  received += next.value.length
                }
                const bytes = Buffer.concat(chunks, taken)
                return { job: job.id, file: index, path: file.path, offset, bytes: bytes.length, total: file.bytes, nextOffset: end < file.bytes ? end : null, sha256: file.sha256, encoding: 'base64', base64: bytes.toString('base64') }
              } finally { await reader.cancel().catch(() => {}) }
            } },
        )
        if (await capable('execute')) tools.push(
          { name: 'prepare_document', description: 'Prepares a free saved document output through the standard workspace build. Read the exact source version and fingerprint first, then supply them unchanged. Retries for the same source and target share preparation; no quote, spend permission, or paid approval is needed. web-student removes teacher-only content and requires edit permission; preparing never publishes it.', inputSchema: schema({ document: documentProperty, target: { type: 'string', enum: ['web', 'slides', 'pdf', 'notebook', 'web-student'] }, source: schema({ version: idProperty, fingerprint: { type: 'string', minLength: 1, maxLength: 256 } }, ['version', 'fingerprint']) }, ['document', 'target', 'source']), readOnly: false, idempotent: true,
            run: async args => {
              const context = await authorizedContext('execute'), source = args.source as Record<string, unknown> | undefined
              if (!source || typeof source !== 'object' || Array.isArray(source)) throw new CloudError(400, 'document-source-invalid')
              return { job: await admission.prepareJob(context.userId, spaceId, requireId(args.document), requireText(args.target), { version: requireId(source.version), fingerprint: requireText(source.fingerprint, 'document-source-invalid', 256) }) }
            } },
          { name: 'quote_job', description: 'Legacy compatibility preparation metadata for free compilation or PDF export. Prefer prepare_document with an exact source; no paid approval or budget is needed. audience=student prepares the filtered edition without publishing it.', inputSchema: schema({ kind: { type: 'string', enum: ['compile', 'export-pdf'] }, document: documentProperty, profileId: { type: 'string', minLength: 1, maxLength: 64 }, audience: { type: 'string', enum: ['student'] } }, ['kind', 'document', 'profileId']), readOnly: true,
            run: async args => { const context = await authorizedContext('execute'); if (args.audience !== undefined && args.audience !== 'student') throw new CloudError(400, 'runtime-audience-invalid'); return { quote: await admission.quoteJob(context.userId, spaceId, requireText(args.kind), requireId(args.document), requireText(args.profileId), args.audience) } } },
          { name: 'cancel_job', description: 'Requests cancellation of existing free document preparation. A completed output remains bound to its immutable source.', inputSchema: schema({ job: idProperty }, ['job']), readOnly: false, idempotent: true,
            run: async args => ({ job: await runtime.call('jobs', { action: 'cancel', context: await authorizedContext('execute'), jobId: requireId(args.job) }) }) },
          { name: 'list_environments', description: 'Lists this member’s private execution environments in the space. Reading never starts kernels.', inputSchema: schema(), readOnly: true,
            run: async () => ({ environments: await runtime.call('environments', { action: 'list', context: await authorizedContext('execute') }) }) },
          { name: 'create_environment', description: 'Creates stopped private environment metadata for an operator-defined Jupyter profile. Creation and execution are free. Use start_environment directly with a stable requestId when the environment is needed.', inputSchema: schema({ profileId: { type: 'string', minLength: 1, maxLength: 64 }, name: { type: 'string', minLength: 1, maxLength: 100 } }, ['profileId', 'name']), readOnly: false,
            run: async args => ({ environment: await runtime.call('environments', { action: 'create', context: await authorizedContext('execute'), profileId: requireText(args.profileId), name: requireText(args.name) }) }) },
          { name: 'quote_environment', description: 'Legacy compatibility metadata for a stopped private environment’s finite, free runtime lease. No paid approval or quote is needed to call start_environment.', inputSchema: schema({ environment: idProperty }, ['environment']), readOnly: true,
            run: async args => { const context = await authorizedContext('execute'); return { quote: await admission.quoteEnvironment(context.userId, spaceId, requireId(args.environment)) } } },
          { name: 'stop_environment', description: 'Stops a private environment’s free runtime lease and retains saved files for a later start. Running code and in-memory variables end.', inputSchema: schema({ environment: idProperty }, ['environment']), readOnly: false, idempotent: true,
            run: async args => ({ environment: await runtime.call('environments', { action: 'stop', context: await authorizedContext('execute'), environmentId: requireId(args.environment) }) }) },
          { name: 'destroy_environment', description: 'Permanently deletes a stopped private environment and all its saved files, releasing its persistent storage. Obtain explicit user confirmation and pass confirmDeleteFiles=true. A running environment must first be stopped.', inputSchema: schema({ environment: idProperty, confirmDeleteFiles: { type: 'boolean', const: true } }, ['environment', 'confirmDeleteFiles']), readOnly: false, idempotent: true,
            run: async args => { if (args.confirmDeleteFiles !== true) throw new CloudError(400, 'runtime-delete-confirmation-required'); return runtime.call('environments', { action: 'destroy', context: await authorizedContext('execute'), environmentId: requireId(args.environment) }) } },
        )
        if (await capable('execute')) tools.push(
          { name: 'start_job', description: 'Legacy compatibility entry point for free compilation or PDF export. Prefer prepare_document. Supply a stable requestId and retry the same quoteId/requestId pair after a lost response; no spend permission is required.', inputSchema: schema({ quoteId: idProperty, requestId: { type: 'string', minLength: 1, maxLength: 120 } }, ['quoteId', 'requestId']), readOnly: false, idempotent: true,
            run: async args => { const context = await authorizedContext('execute'); return { job: await admission.startJob(context.userId, spaceId, requireId(args.quoteId), requireText(args.requestId)) } } },
          { name: 'start_environment', description: 'Starts one free, finite runtime lease for a private environment. Supply a stable requestId and retry it after a lost response. quoteId is optional legacy compatibility metadata; no spend permission or paid approval is required.', inputSchema: schema({ environment: idProperty, quoteId: idProperty, requestId: { type: 'string', minLength: 1, maxLength: 120 } }, ['environment', 'requestId']), readOnly: false, idempotent: true,
            run: async args => { const context = await authorizedContext('execute'); const environmentId = requireId(args.environment), requestId = requireText(args.requestId); return { environment: args.quoteId === undefined ? await admission.startFreeEnvironment(context.userId, spaceId, environmentId, requestId) : await admission.startEnvironment(context.userId, spaceId, environmentId, requireId(args.quoteId), requestId) } } },
        )
      }
      const handler = createMcpToolHandler(tools, {
        name: 'presmium-cloud', version: '0.1.0',
        failure: error => error instanceof CloudError ? { code: error.code, status: error.status, ...error.details ? { details: error.details } : {} }
          : error instanceof DocumentReadError ? { code: error.message, status: error.status } : { code: 'service-unavailable', status: 503 },
      })
      active.add(handler)
      let response: Response
      try { response = await handler.fetch(request) }
      catch (error) { active.delete(handler); await handler.close(); throw error }
      const finish = async () => { active.delete(handler); await handler.close() }
      if (!response.body) { await finish(); return response }
      const reader = response.body.getReader()
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          try { const chunk = await reader.read(); if (chunk.done) { controller.close(); await finish() } else controller.enqueue(chunk.value) }
          catch (error) { controller.error(error); await finish() }
        },
        async cancel(reason) { try { await reader.cancel(reason) } finally { await finish() } },
      }), { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) { return fail(error) }
  })
  return { async close() { await Promise.allSettled([...active].map(handler => handler.close())); active.clear() } }
}
