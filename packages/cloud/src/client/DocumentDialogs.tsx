import { useEffect, useState } from 'react'
import { useWorkbench, useWorkbenchState } from '@lincyaw/workbench'
import { PmBadge, PmButton, PmCard, PmChoiceSelect, PmDialog, PmEmpty, PmNotice } from '@lincyaw/workbench/components'
import type { HistoryRevision, TeachingDocument } from '@lincyaw/kernel'
import { ApiError, dateLabel, followURL, request, spacePath } from './api.ts'
import type { ContentStatus, Locale, Publication, Space } from './api.ts'
import { useMutation, useResource } from './hooks.ts'
import { CopyField, ErrorNotice, MutationError, ResourceState } from './components.tsx'
import type { Messages } from './messages.ts'

interface RestoreIntent { revision: string, baseDocumentVersion: string, requestId: string }
function readRestoreIntent(key: string): RestoreIntent | undefined {
  const text = sessionStorage.getItem(key)
  if (!text) return
  const value = JSON.parse(text) as RestoreIntent
  if (!/^[a-f0-9]{64}$/.test(value.revision) || !/^[a-f0-9-]{36}$/i.test(value.baseDocumentVersion) || !/^[a-f0-9-]{36}$/i.test(value.requestId)) throw new Error('document-restore-receipt-invalid')
  return value
}
function saveRestoreIntent(key: string, intent: RestoreIntent): void {
  const text = JSON.stringify(intent)
  sessionStorage.setItem(key, text)
  if (sessionStorage.getItem(key) !== text) throw new Error('document-restore-receipt-unavailable')
}

/** Publishing grants anonymous access; producing the student output uses Studio's ordinary export owner. */
export function PublicationDialog({ space, documentId, t, locale, onClose }: { space: Space, documentId: string, t: Messages, locale: Locale, onClose(): void }) {
  const path = spacePath(space.id, `documents/${encodeURIComponent(documentId)}`)
  const resource = useResource<{ publications: Publication[] }>(`${path}/publications`)
  const content = useResource<ContentStatus>(`${path}/content`, 2000)
  const workbench = useWorkbench()
  const state = useWorkbenchState(state => state)
  useEffect(() => workbench.observeJobs(), [workbench])
  const mutation = useMutation()
  const [form, setForm] = useState<'web' | 'slides'>('web'), [requestId, setRequestId] = useState(() => crypto.randomUUID()), [revoking, setRevoking] = useState<Publication>()
  const status = content.data, jobId = status?.publications[form]?.jobId
  const studentJob = state.jobs?.jobs.find(job => job.target === 'web-student' && job.source?.version === state.authoring?.version)
  const generating = state.jobPreparing?.target === 'web-student' || Boolean(studentJob && ['queued', 'running'].includes(studentJob.state))
  const sourceReady = Boolean(state.authoring?.version && !state.authoring.dirty && !state.authoring.saving && !state.authoring.error && !state.authoring.restored && !state.authoring.composing)
  useEffect(() => setRequestId(crypto.randomUUID()), [status?.sourceVersion, jobId, form])
  return <PmDialog open label={t.publications} closeLabel={t.close} busy={mutation.pending} onClose={onClose}><div className="pmc-stack">
    <p>{t.publicationHint}</p><MutationError mutation={mutation} t={t} /><ErrorNotice error={content.error} t={t} retry={content.refresh} />
    <PmChoiceSelect label={t.outputForm} value={form} disabled={mutation.pending} onValueChange={value => setForm(value as 'web' | 'slides')} choices={[{ value: 'web', label: t.webForm }, ...status?.publications.slides ? [{ value: 'slides', label: t.slidesForm }] : []]} />
    {!jobId && <PmNotice>{t.publicationRequired}</PmNotice>}
    {generating && <PmNotice>{t.studentGenerating}</PmNotice>}
    {!jobId && studentJob && ['failed', 'cancelled'].includes(studentJob.state) && <PmNotice tone="danger">{t.studentBuildFailed}</PmNotice>}
    {state.jobsFailure && <PmNotice tone="danger">{t.errorUnavailable}</PmNotice>}
    {!jobId && <PmButton variant="primary" disabled={space.role === 'reader' || mutation.pending || Boolean(generating)} loading={state.jobPreparing?.target === 'web-student'} icon="website" onClick={() => void workbench.startJob('web-student')}>{t.compilePublic}</PmButton>}
    <PmButton variant="primary" disabled={space.role === 'reader' || !jobId || !status || !sourceReady || status.sourceVersion !== state.authoring?.version} loading={mutation.pending} onClick={() => void mutation.run(async () => { await workbench.flushPendingEdits(); await request(`${path}/publications`, { method: 'POST', body: { requestId, jobId, sourceVersion: status!.sourceVersion } }); resource.refresh() })}>{t.publishDocument}</PmButton>
    <ResourceState resource={resource} t={t}>{resource.data?.publications.length === 0 ? <PmEmpty title={t.noPublications} /> : resource.data?.publications.map(publication => <PmCard key={publication.id}><h2 className="pm-ui-card__title">{publication.title}</h2><span>{t.publicationSource} · {dateLabel(publication.createdAt, locale)}</span>{publication.revokedAt ? <PmBadge>{t.publicationRevoked}</PmBadge> : <><CopyField label={t.publicationLink} value={publication.url} t={t} /><div className="pmc-actions"><PmButton icon="external" onClick={() => followURL(publication.url, true)}>{t.openDocument}</PmButton>{space.role !== 'reader' && <PmButton variant="ghost" disabled={mutation.pending} onClick={() => { setRevoking(publication); mutation.clear() }}>{t.revokePublication}</PmButton>}</div></>}</PmCard>)}</ResourceState>
    {revoking && <PmNotice tone="warn"><div className="pmc-stack"><p>{t.revokePublicationHint}</p><div className="pmc-actions"><PmButton disabled={mutation.pending} onClick={() => setRevoking(undefined)}>{t.cancel}</PmButton><PmButton variant="danger" loading={mutation.pending} onClick={() => void mutation.run(async () => { await request(`${path}/publications/${encodeURIComponent(revoking.id)}`, { method: 'DELETE' }); setRevoking(undefined); setRequestId(crypto.randomUUID()); resource.refresh() })}>{t.revokePublication}</PmButton></div></div></PmNotice>}
  </div></PmDialog>
}

/** The shared HistoryPanel owns the list; the cloud host only confirms an absolute snapshot restore. */
export function RestoreVersionDialog({ space, documentId, revision, t, locale, onClose }: { space: Space, documentId: string, revision: HistoryRevision, t: Messages, locale: Locale, onClose(): void }) {
  const workbench = useWorkbench()
  const path = `${spacePath(space.id, 'presmium')}/document/version`
  const previous = useResource<{ version: string, content: TeachingDocument }>(`${path}?document=${encodeURIComponent(documentId)}&revision=${encodeURIComponent(revision.id)}`)
  const key = `presmium.cloud.restore:${space.id}:${documentId}:${revision.id}`
  const [intent, setIntent] = useState<RestoreIntent>(), [restored, setRestored] = useState(false), [storageFailure, setStorageFailure] = useState(false)
  useEffect(() => { try { setIntent(readRestoreIntent(key)); setStorageFailure(false) } catch { setStorageFailure(true) } }, [key])
  const mutation = useMutation()
  return <PmDialog open label={t.restoreSnapshot} closeLabel={t.close} busy={mutation.pending} onClose={onClose}><div className="pmc-stack">
    <p>{dateLabel(revision.date, locale)} · {revision.author}</p>
    <ResourceState resource={previous} t={t}>{previous.data && <PmCard><h2 className="pm-ui-card__title">{previous.data.content.metadata.title}</h2><span>{t.pageCount} · {previous.data.content.sectionOrder.length}</span></PmCard>}</ResourceState>
    <p>{t.restoreSnapshotHint}</p><MutationError mutation={mutation} t={t} />{storageFailure && <PmNotice tone="danger">{t.confirmationStorageUnavailable}</PmNotice>}{restored && <PmNotice tone="ok">{t.snapshotRestored}</PmNotice>}
    <div className="pmc-actions"><PmButton onClick={onClose} disabled={mutation.pending}>{restored ? t.close : t.cancel}</PmButton><PmButton variant="primary" disabled={space.role === 'reader' || !previous.data || restored} loading={mutation.pending} onClick={() => void mutation.run(async () => {
      let operation: RestoreIntent | undefined
      try { operation = readRestoreIntent(key); setStorageFailure(false) } catch { setStorageFailure(true); return }
      if (!operation) {
        await workbench.flushPendingEdits()
        const source = workbench.getState().authoring
        if (!source?.version || source.dirty || source.saving || source.error || source.composing || source.restored) throw new Error('document-save-required')
        operation = { revision: revision.id, baseDocumentVersion: source.version, requestId: crypto.randomUUID() }
        try { saveRestoreIntent(key, operation) } catch { setStorageFailure(true); return }
        setIntent(operation)
      }
      try {
        await request(`${path}/restore?document=${encodeURIComponent(documentId)}`, { method: 'POST', body: operation })
        setRestored(true)
        try { sessionStorage.removeItem(key) } catch { /* A retained receipt only replays the same completed operation. */ }
      } catch (error) {
        // Only this explicit pre-write source rejection permits a new confirmation.
        if (error instanceof ApiError && error.code === 'document-version-changed') {
          try { sessionStorage.removeItem(key); setIntent(undefined) } catch { setStorageFailure(true) }
        }
        throw error
      }
    })}>{intent && !restored && !mutation.pending ? t.retry : t.restoreSnapshot}</PmButton></div>
  </div></PmDialog>
}
