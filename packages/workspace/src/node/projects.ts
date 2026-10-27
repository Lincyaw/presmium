import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROJECT_MAX_PLANS, PROJECT_PLAN_TTL_MS, PROJECT_MAX_REQUEST_CHARS, PROJECT_MAX_RESPONSE_CHARS, hasRole, jsonResponse, problemResponse, validateDocument } from '@lincyaw/kernel'
import type { ProjectApplied, ProjectApply, ProjectAuthoring, ProjectCaller, ProjectPlan, ProjectPlanRequest, Route } from '@lincyaw/kernel'
import { validateProjectApply, validateProjectPlan } from '@lincyaw/kernel/node'
import type { WorkspaceConfig } from './config.ts'
import type { DocumentOperations } from './document-operations.ts'
import type { Git } from './git.ts'
import type { Revisions } from './revisions.ts'
import { DOCUMENT_OPERATION_MAX_BACKUP_BYTES, DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES, documentDirOf } from './writer.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import { projectConfiguration, projectDigest, projectMaterial } from './project-files.ts'

type Stored = { member: string, origin: ProjectCaller['origin'], signature: string, plan: ProjectPlan, material: ReturnType<typeof projectMaterial>, receipt?: ProjectApplied, work?: Promise<ProjectApplied> }
const budget = (value: unknown) => { const raw = JSON.stringify(value); if (raw === undefined) throw new RequestError(400, 'project-request-invalid'); if (raw.length > PROJECT_MAX_REQUEST_CHARS) throw new RequestError(413, 'project-request-too-large') }
const bounded = <T>(value: T): T => { if (JSON.stringify(value, null, 2).length > PROJECT_MAX_RESPONSE_CHARS) throw new RequestError(413, 'project-response-too-large'); return value }
const signature = (request: ProjectPlanRequest) => projectDigest(JSON.stringify([request.id, Object.fromEntries(Object.entries(request.operation).sort(([a], [b]) => a.localeCompare(b)))]))

/** One workspace plan owner; all mutations still belong to DocumentOperations and its git transaction. */
export function createProjectAuthoring(options: { config: WorkspaceConfig, operations?: DocumentOperations, revisions?: Revisions, git?: Git }) {
  const { config, operations, revisions, git } = options, plans = new Map<string, Stored>()
  let closed = false
  const reasons = (caller: ProjectCaller) => [
    ...!hasRole(caller.member, 'editor') ? ['project-permission-denied'] : [],
    ...caller.boundDocument !== undefined ? ['project-workspace-scope-required'] : [],
    ...config.singleDeck ? ['project-single-document-workspace'] : [],
    ...!operations || !revisions || !git ? ['project-git-unavailable'] : [],
    ...caller.origin === 'agent' && config.approvals.operate === 'off' ? ['project-operation-disabled'] : [],
    ...caller.origin === 'agent' && config.settings['presmium.assistant']?.review === 'required' ? ['authoring-review-required'] : [],
  ]
  const authorize = (caller: ProjectCaller) => {
    if (closed) throw new RequestError(503, 'project-owner-closed')
    const refusal = reasons(caller)[0]
    if (refusal) throw new RequestError(refusal === 'project-permission-denied' || refusal === 'project-workspace-scope-required' ? 403 : 409, refusal)
  }
  const observation = async () => ({ snapshot: await revisions?.head(), configuration: projectConfiguration(config) })
  const current = async (stored: Stored, result: boolean) => {
    const observed = await observation()
    const expected = result ? stored.receipt : stored.plan.observation
    if (observed.configuration !== stored.plan.observation.configuration || observed.snapshot !== (result ? stored.receipt?.snapshot : expected?.snapshot)) throw new RequestError(409, 'project-source-changed', { observation: observed })
    const material = projectMaterial(config, stored.plan.operation, stored.plan.documentId, result)
    if (material.tree !== (result ? stored.receipt?.tree : stored.plan.tree)) throw new RequestError(409, 'project-tree-changed')
  }
  const key = (request: ProjectPlanRequest, caller: ProjectCaller) => JSON.stringify([caller.member.id, caller.origin, request.id])
  const service: ProjectAuthoring = {
    async capabilities(caller) {
      if (closed) throw new RequestError(503, 'project-owner-closed')
      const observed = await observation(), unavailable = reasons(caller)
      if (!observed.snapshot && !unavailable.includes('project-git-unavailable')) unavailable.push('project-head-unavailable')
      return bounded({ available: unavailable.length === 0, reasons: unavailable, observation: observed, verification: 'configuration-only', rootDirectoryOperations: false,
        limits: { requestChars: PROJECT_MAX_REQUEST_CHARS, responseChars: PROJECT_MAX_RESPONSE_CHARS, backupEntries: DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES, backupBytes: DOCUMENT_OPERATION_MAX_BACKUP_BYTES, plans: PROJECT_MAX_PLANS, ttlMs: PROJECT_PLAN_TTL_MS } })
    },
    async plan(request, caller) {
      authorize(caller); budget(request)
      if (!validateProjectPlan(request)) throw new RequestError(400, 'project-plan-invalid')
      if (request.operation.dir === '' && !['create', 'retitle'].includes(request.operation.op)) throw new RequestError(409, 'project-root-operation-unavailable')
      return git!.exclusive(async () => {
        authorize(caller)
        for (const [id, stored] of plans) if (!stored.work && Date.parse(stored.plan.expiresAt) <= Date.now()) plans.delete(id)
        const id = key(request, caller), existing = plans.get(id), sig = signature(request)
        if (existing) { if (existing.signature !== sig) throw new RequestError(409, 'project-intent-id-reused'); await current(existing, Boolean(existing.receipt)); return structuredClone(existing.plan) }
        if (plans.size >= PROJECT_MAX_PLANS) throw new RequestError(429, 'project-plan-capacity')
        const observed = await observation()
        if (!observed.snapshot) throw new RequestError(409, 'project-head-unavailable')
        const documentId = request.operation.op === 'create' || request.operation.op === 'copy' ? randomUUID() : undefined
        const input = request.operation.op === 'create' ? { ...request.operation, title: request.operation.title?.trim() || request.operation.dir.split('/').at(-1)! } : structuredClone(request.operation)
        const material = projectMaterial(config, input, documentId)
        const operation = input.op === 'create' ? { ...input, template: material.template } : input
        {
          const dirty = await revisions!.uncommittedFiles([...material.changes.map(change => change.path), ...operation.op === 'delete' || operation.op === 'rename' ? [operation.dir] : []])
          if (dirty.length) throw new RequestError(409, 'project-uncommitted-target', { count: dirty.length })
        }
        const draft = { id: request.id, planId: randomUUID(), operation, observation: observed, tree: material.tree, ...documentId ? { documentId } : {}, expiresAt: new Date(Date.now() + PROJECT_PLAN_TTL_MS).toISOString(),
          impact: { added: operation.op === 'delete' ? [] : [operation.op === 'rename' || operation.op === 'copy' ? operation.to : operation.dir], removed: operation.op === 'delete' || operation.op === 'rename' ? [operation.dir] : [], files: material.impactFiles, bytes: material.impactBytes, referenceDocuments: [...new Set(material.changes.map(change => documentDirOf(config, change.path)).filter((dir): dir is string => dir !== undefined && dir !== (operation.op === 'rename' || operation.op === 'copy' ? operation.to : operation.dir)))], referencePolicy: 'preserve-or-refuse' as const } }
        const plan = bounded({ ...draft, digest: projectDigest(JSON.stringify(draft)) })
        plans.set(id, { member: caller.member.id, origin: caller.origin, signature: sig, plan, material })
        return structuredClone(plan)
      })
    },
    async readPlan(request, caller) {
      authorize(caller); budget(request)
      if (!validateProjectApply(request)) throw new RequestError(400, 'project-apply-invalid')
      const stored = [...plans.values()].find(item => item.plan.planId === request.planId && item.member === caller.member.id && item.origin === caller.origin)
      if (!stored || stored.plan.digest !== request.digest) throw new RequestError(404, 'project-plan-not-found')
      if (!stored.receipt && Date.parse(stored.plan.expiresAt) <= Date.now()) throw new RequestError(409, 'project-plan-expired')
      await current(stored, Boolean(stored.receipt))
      return structuredClone(stored.plan)
    },
    async apply(request: ProjectApply, caller: ProjectCaller, signal?: AbortSignal) {
      signal?.throwIfAborted()
      authorize(caller); budget(request)
      if (!validateProjectApply(request)) throw new RequestError(400, 'project-apply-invalid')
      const stored = [...plans.values()].find(item => item.plan.planId === request.planId && item.member === caller.member.id && item.origin === caller.origin)
      if (!stored || stored.plan.digest !== request.digest) throw new RequestError(404, 'project-plan-not-found')
      if (stored.plan.operation.op === 'delete' && request.confirmDeletion !== true) throw new RequestError(409, 'project-deletion-confirmation-required')
      if (stored.receipt) { await current(stored, true); return structuredClone(stored.receipt) }
      if (Date.parse(stored.plan.expiresAt) <= Date.now()) throw new RequestError(409, 'project-plan-expired')
      if (stored.work) return stored.work
      const work = (async () => {
        // DocumentOperations owns the queue; verify runs inside that transaction before any mutation.
        const answer = await operations!.apply(stored.plan.operation, caller.member, { documentId: stored.plan.documentId, origin: caller.origin, changes: stored.material.changes,
          verify: async () => { signal?.throwIfAborted(); authorize(caller); if (Date.parse(stored.plan.expiresAt) <= Date.now()) throw new RequestError(409, 'project-plan-expired'); await current(stored, false)
            const op = stored.plan.operation
            if ((await revisions!.uncommittedFiles([...stored.material.changes.map(change => change.path), ...op.op === 'rename' || op.op === 'delete' ? [op.dir] : []])).length) throw new RequestError(409, 'project-uncommitted-target')
          } })
        try {
          const snapshot = await revisions!.head()
          if (!snapshot || answer.revision?.id !== snapshot) throw new RequestError(409, 'project-readback-changed', { committed: true })
          const material = projectMaterial(config, stored.plan.operation, stored.plan.documentId, true)
          const revision = answer.revision && { ...answer.revision, message: answer.revision.message.split('\n')[0]!.slice(0, 240), author: answer.revision.author.slice(0, 120), origin: { kind: answer.revision.origin.kind }, files: answer.revision.files.filter(path => path.length <= 500).slice(0, 6) }
          const receipt: ProjectApplied = { dir: answer.dir, revision, revisionTruncated: true, fileCount: answer.revision?.files.length, id: stored.plan.id, planId: stored.plan.planId, snapshot, tree: material.tree, ...stored.plan.documentId ? { documentId: stored.plan.documentId } : {}, verification: { saved: true, readback: 'verified', compiled: 'not-requested' } }
          const op = stored.plan.operation
          if (op.op === 'rename' || op.op === 'delete') if (existsSync(join(config.root, op.dir))) throw new RequestError(409, 'project-readback-changed', { committed: true })
          for (const change of stored.material.changes) if ('content' in change && projectDigest(readFileSync(join(config.root, change.path))) !== projectDigest(change.content)) throw new RequestError(409, 'project-readback-changed', { committed: true })
          if (stored.plan.documentId && answer.dir) {
            const checked = validateDocument(JSON.parse(readFileSync(join(config.root, answer.dir, 'lecture.json'), 'utf8')))
            if (checked.document?.id !== stored.plan.documentId) throw new RequestError(409, 'project-readback-changed', { committed: true })
          }
          stored.receipt = bounded(receipt)
          return structuredClone(stored.receipt)
        } catch (error) {
          if (error instanceof RequestError && error.detail?.committed === true) throw error
          throw new RequestError(409, 'project-readback-changed', { committed: true, planId: stored.plan.planId })
        }
      })()
      stored.work = work
      try { return await work } finally { if (stored.work === work) stored.work = undefined }
    },
  }
  const caller = (member: ProjectCaller['member']): ProjectCaller => ({ member, origin: 'editor' })
  const routes: Record<string, Route> = {
    'project/capabilities': { role: 'reader', handle: (request, ctx) => catchRequestErrors(async () => request.method === 'GET' ? jsonResponse(await service.capabilities(caller(ctx.member))) : problemResponse(405, 'GET')) },
    'project/plan': { role: 'editor', maxBody: PROJECT_MAX_REQUEST_CHARS * 4, handle: (request, ctx) => catchRequestErrors(async () => { if (request.method !== 'POST') return problemResponse(405, 'POST'); return jsonResponse(await service.plan(await request.json().catch(() => undefined), caller(ctx.member))) }) },
    'project/apply': { role: 'editor', maxBody: PROJECT_MAX_REQUEST_CHARS * 4, handle: (request, ctx) => catchRequestErrors(async () => { if (request.method !== 'POST') return problemResponse(405, 'POST'); return jsonResponse(await service.apply(await request.json().catch(() => undefined), caller(ctx.member), request.signal)) }) },
  }
  return { service, routes, async close() { closed = true; await Promise.allSettled([...plans.values()].flatMap(plan => plan.work ? [plan.work] : [])); plans.clear() } }
}
