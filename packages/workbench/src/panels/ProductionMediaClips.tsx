import { useEffect, useRef, useState } from 'react'
import type { DocumentChangeAnswer, MediaClip, ProductionAssetInspection, ProductionBinding, TeachingDocument } from '@lincyaw/kernel'
import { MediaClipEditor } from '../MediaClipEditor.tsx'
import type { MediaClipDraft } from '../MediaClipEditor.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { keepMediaDrafts, mediaDraftStorageFailed, readMediaDrafts } from '../media-drafts.ts'
import type { MediaDrafts } from '../media-drafts.ts'
import { MEDIA_MESSAGES, mediaFailure } from '../media-messages.ts'

interface Props {
  identity: string
  version: string
  document: TeachingDocument
  sectionId: string
  stepId: string
  binding?: ProductionBinding
  stepDurationMs?: number
  disabled: boolean
  onChanged(): void
}
const newDraft = (version: string, stepId: string): MediaClipDraft => ({ version, clip: { id: `clip_${crypto.randomUUID().replaceAll('-', '')}`, assetId: '', sourceRange: { startMs: 0, endMs: 0 }, attachment: { stepId, offsetMs: 0 }, volume: 1, muted: false } })
const fromClip = (version: string, clip: MediaClip): MediaClipDraft => ({ version, clip: structuredClone(clip), baseClip: structuredClone(clip) })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const draftKey = (clipId?: string) => clipId === undefined ? 'new' : `clip:${clipId}`
const ownDraft = (entries: MediaDrafts['entries'], key: string) => Object.hasOwn(entries, key) ? entries[key] : undefined

/** The source actor owns writes; this adapter owns only stable-target input and request lifetimes. */
export function ProductionMediaClips({ identity, version, document, sectionId, stepId, binding, stepDurationMs, disabled, onChanged }: Props) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = MEDIA_MESSAGES[locale]
  const [session, setSession] = useState(() => readMediaDrafts(workbench.client, identity, stepId)), latest = useRef(session)
  const [storageFailed, setStorageFailed] = useState(() => mediaDraftStorageFailed(workbench.client, identity, stepId))
  const [inspection, setInspection] = useState<{ version: string, value: ProductionAssetInspection }>(), [loading, setLoading] = useState(false), [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<'import' | 'apply' | 'remove'>(), [failure, setFailure] = useState<string>(), [status, setStatus] = useState<string>()
  const [retryImport, setRetryImport] = useState(false), file = useRef<File>(), request = useRef<AbortController>()
  const owner = useRef({ active: true, revision: 0 }), blank = useRef<MediaClipDraft>()
  blank.current ??= newDraft(version, stepId)
  const clips = document.production.mediaClips.filter(clip => clip.attachment.stepId === stepId), selectedClipId = session.selectedClipId
  const key = draftKey(selectedClipId), canonical = clips.find(clip => clip.id === selectedClipId)
  const draft = ownDraft(session.entries, key) ?? (canonical ? fromClip(version, canonical) : { ...blank.current, version })
  const snapshot = useRef(draft), selected = useRef(key)
  snapshot.current = draft; selected.current = key; latest.current = session
  const assets = Object.values(document.assets).filter(asset => asset.kind === 'audio').map(asset => ({ id: asset.id, label: asset.title || asset.location.split('/').at(-1) || asset.id }))
  const active = () => owner.current.active && workbench.getState().authoring?.identity === identity
  const remember = (value: MediaDrafts) => {
    latest.current = value; setSession(value)
    setStorageFailed(!keepMediaDrafts(workbench.client, identity, stepId, value))
  }
  const edit = (value: MediaClipDraft) => {
    owner.current.revision++; setFailure(undefined); setStatus(undefined)
    remember({ ...latest.current, entries: { ...latest.current.entries, [selected.current]: value } })
  }
  const pause = () => { workbench.stopAuditions(); workbench.selectDocumentStep(sectionId, stepId) }
  useEffect(() => () => { owner.current.active = false; request.current?.abort(); file.current = undefined }, [])
  useEffect(() => {
    const assetId = draft.clip.assetId, controller = new AbortController(), requestKey = key
    if (!assetId || disabled || !version || inspection?.version === version && inspection.value.assetId === assetId) { setLoading(false); return }
    setLoading(true)
    void workbench.inspectDocumentAudio(assetId, { identity, version }, controller.signal).then(answer => {
      if (controller.signal.aborted || !active()) return
      setInspection({ version: answer.version, value: answer.inspection })
      const current = ownDraft(latest.current.entries, requestKey)
      if (current?.clip.assetId === assetId && current.clip.sourceRange.endMs === 0 && current.startText === undefined && current.endText === undefined) {
        remember({ ...latest.current, entries: { ...latest.current.entries, [requestKey]: { ...current, clip: { ...current.clip, sourceRange: { startMs: 0, endMs: answer.inspection.durationMs } } } } })
      }
    }, error => { if (!controller.signal.aborted && active()) setFailure(mediaFailure(error, locale)) }).finally(() => { if (!controller.signal.aborted && active()) setLoading(false) })
    return () => controller.abort()
  }, [workbench, identity, version, draft.clip.assetId, key, disabled, reload])
  const start = (kind: 'import' | 'apply' | 'remove') => {
    const source = workbench.getState().authoring
    if (!active() || disabled || busy || request.current || source?.version !== version || source.dirty || source.saving || source.loading || source.composing || source.restored || source.error) return undefined
    const controller = new AbortController(); request.current = controller
    setBusy(kind); setFailure(undefined); setStatus(undefined)
    pause()
    return { controller, expected: { identity, version }, revision: owner.current.revision, key: selected.current, draft: structuredClone(snapshot.current) }
  }
  const finish = (controller: AbortController) => { if (request.current === controller) { request.current = undefined; if (active()) setBusy(undefined) } }
  const acknowledge = (answer: Pick<DocumentChangeAnswer, 'version'>, expectedVersion: string) => {
    const entries = Object.fromEntries(Object.entries(latest.current.entries).map(([id, value]) => [id, value.version === expectedVersion ? { ...value, version: answer.version } : value]))
    return { ...latest.current, entries }
  }
  const importAudio = async (value: File) => {
    if (!value.size || value.size > 16 * 1024 * 1024) { setFailure(t.size); setRetryImport(false); return }
    const sent = start('import')
    if (!sent) return
    file.current = value; setRetryImport(false)
    try {
      const answer = await workbench.ensureDocumentAudio(value, sent.expected, sent.controller.signal)
      if (!active() || sent.controller.signal.aborted) return
      const next = acknowledge(answer, sent.expected.version)
      if (owner.current.revision === sent.revision && selected.current === sent.key) {
        const full = newDraft(answer.version, stepId)
        full.clip.assetId = answer.inspection.assetId; full.clip.sourceRange.endMs = answer.inspection.durationMs
        next.selectedClipId = undefined; next.entries.new = full
        setInspection({ version: answer.version, value: answer.inspection })
      }
      remember(next); file.current = undefined; setStatus(t.imported); onChanged()
    } catch (error) { if (active() && !sent.controller.signal.aborted) { setFailure(mediaFailure(error, locale)); setRetryImport(true) } }
    finally { finish(sent.controller) }
  }
  const apply = async (clip: MediaClip) => {
    if (!binding || stepDurationMs === undefined || draft.version !== version || clip.attachment.stepId !== stepId) return
    const sent = start('apply')
    if (!sent) return
    try {
      const answer = await workbench.applyDocumentMediaClip(clip, { ...sent.expected, binding }, sent.controller.signal)
      if (!active() || sent.controller.signal.aborted) return
      const next = acknowledge(answer, sent.expected.version), current = ownDraft(latest.current.entries, sent.key)
      if (sent.key === 'new') blank.current = newDraft(answer.version, stepId)
      if (current && same(current, sent.draft)) delete next.entries[sent.key]
      else if (current) next.entries[sent.key] = { ...ownDraft(next.entries, sent.key)!, baseClip: structuredClone(clip) }
      if (selected.current === sent.key) {
        next.selectedClipId = clip.id
        const pending = ownDraft(next.entries, 'new')
        if (sent.key === 'new' && pending) { next.entries[draftKey(clip.id)] = pending; delete next.entries.new }
      }
      remember(next); setStatus(t.saved); onChanged()
    } catch (error) { if (active() && !sent.controller.signal.aborted) setFailure(mediaFailure(error, locale)) }
    finally { finish(sent.controller) }
  }
  const remove = async () => {
    if (!canonical) return
    const sent = start('remove')
    if (!sent) return
    try {
      const answer = await workbench.removeDocumentMediaClip(canonical.id, sent.expected, sent.controller.signal)
      if (!active() || sent.controller.signal.aborted) return
      const next = acknowledge(answer, sent.expected.version), current = ownDraft(latest.current.entries, sent.key)
      if (!current || same(current, sent.draft)) {
        delete next.entries[sent.key]
        if (selected.current === sent.key) { next.selectedClipId = undefined; blank.current = newDraft(answer.version, stepId) }
      }
      remember(next); setStatus(t.saved); onChanged()
    } catch (error) { if (active() && !sent.controller.signal.aborted) setFailure(mediaFailure(error, locale)) }
    finally { finish(sent.controller) }
  }
  const inspectCurrent = inspection?.version === version && inspection.value.assetId === draft.clip.assetId ? inspection.value : undefined
  return <MediaClipEditor locale={locale} assets={assets} clips={clips} selectedClipId={selectedClipId} draft={draft} inspection={inspectCurrent} stepDurationMs={stepDurationMs}
    disabled={disabled} canApply={Boolean(binding && stepDurationMs !== undefined)} loading={loading} busy={busy} pending={Boolean(ownDraft(session.entries, key))} review={Boolean(ownDraft(session.entries, key) && draft.version !== version)}
    failure={failure} storageFailed={storageFailed} status={status} retryImport={retryImport}
    onEditStart={pause} onChange={edit} onImport={value => void importAudio(value)} onRetryImport={() => { if (file.current) void importAudio(file.current) }}
    onRead={() => { setFailure(undefined); setInspection(undefined); setReload(value => value + 1) }}
    onReview={() => { if (inspectCurrent && (!draft.baseClip || canonical)) edit({ ...draft, version, ...canonical ? { baseClip: structuredClone(canonical) } : {} }) }}
    onSelectClip={id => {
      owner.current.revision++; setFailure(undefined); setStatus(undefined)
      const next = { ...latest.current, selectedClipId: id }
      if (!id && selectedClipId && !canonical) {
        const retained = ownDraft(latest.current.entries, draftKey(selectedClipId))
        if (retained) next.entries = { ...next.entries, new: { ...retained, clip: { ...retained.clip, id: newDraft(version, stepId).clip.id }, baseClip: undefined } }
      }
      remember(next)
    }}
    onSelectAsset={id => {
      const value = snapshot.current
      edit({ ...value, clip: { ...value.clip, assetId: id, sourceRange: { startMs: 0, endMs: 0 } }, startText: undefined, endText: undefined })
    }} onApply={clip => void apply(clip)} onRemove={() => void remove()} />
}
