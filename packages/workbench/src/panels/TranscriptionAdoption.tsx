import { useEffect, useMemo, useRef, useState } from 'react'
import { prepareTranscriptionAdoption } from '@lincyaw/kernel'
import type { CanonicalSource, NarrationNode, TeachingDocument, TranscriptionRevision, TranscriptionAdoptionDraft, TranscriptionAdoptionPart, TranscriptionAdoptionPlan } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmDialog, PmField, PmNotice, PmSelect, PmTextarea } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { NarrationEditor } from '../document-editor/NarrationEditor.tsx'
import { narrationToNative } from '../document-editor/narration.ts'
import type { NativeNarrationEditor } from '../document-editor/narration-schema.tsx'
import { TRANSCRIPTION_MESSAGES } from '../transcription-messages.ts'

interface Props { identity: string, candidate: TranscriptionRevision, document: TeachingDocument, sectionId: string, stepId: string, disabled: boolean }
interface Draft { id: string, revision: number, nodes?: NarrationNode[], discarded: string[], shared: 'fork' | 'edit-shared', baseVersion?: string, applied?: boolean }
const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered((value as Record<string, unknown>)[key])])) : value
const same = (a: unknown, b: unknown) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b))
const displayed = (nodes: readonly NarrationNode[]) => nodes.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.display : '').join('')
function restore(key: string): { draft: Draft, failed: boolean } {
  const fallback = () => ({ draft: { id: crypto.randomUUID(), revision: 0, discarded: [], shared: 'fork' as const }, failed: false })
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback()
    const value = JSON.parse(raw)
    if (!value || typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.discarded) || !value.discarded.every((key: unknown) => typeof key === 'string') || !['fork', 'edit-shared'].includes(value.shared)
      || value.baseVersion !== undefined && typeof value.baseVersion !== 'string' || value.applied !== undefined && typeof value.applied !== 'boolean'
      || value.nodes !== undefined && (!Array.isArray(value.nodes) || !value.nodes.every((node: NarrationNode) => node && (node.type === 'text' && typeof node.text === 'string' || node.type === 'pronunciation' && typeof node.display === 'string' && typeof node.spoken === 'string' || node.type === 'cue' && typeof node.id === 'string' && typeof node.action === 'string')))) throw new Error('invalid-draft')
    return { draft: value, failed: false }
  } catch { return { ...fallback(), failed: true } }
}

export function TranscriptionAdoption(props: Props) {
  const locale = useWorkbenchState(state => state.locale), t = TRANSCRIPTION_MESSAGES[locale]
  const ids = props.document.steps[props.stepId]?.narrationIds ?? []
  const [selected, setSelected] = useState(ids[0] ?? ''), [segment, setSegment] = useState('all')
  const narrationId = ids.includes(selected) ? selected : ids[0]
  const segments = segment === 'all' ? props.candidate.result.segments.map(value => value.id) : [segment]
  return <>
    {ids.length > 1 && <PmSelect label={t.narration} value={narrationId ?? ''} disabled={props.disabled} onChange={event => setSelected(event.target.value)}>{ids.map((id, index) => <option key={id} value={id}>{t.narration} {index + 1}</option>)}</PmSelect>}
    {props.candidate.result.segments.length > 1 && <PmSelect label={t.segments} value={segment} disabled={props.disabled} onChange={event => setSegment(event.target.value)}><option value="all">{t.allSegments}</option>{props.candidate.result.segments.map((value, index) => <option key={value.id} value={value.id}>{t.segment(index)} · {value.text.slice(0, 30)}</option>)}</PmSelect>}
    <AdoptionTarget key={JSON.stringify([narrationId, segments])} {...props} narrationId={narrationId} segments={segments} />
  </>
}

function AdoptionTarget({ identity, candidate, document, sectionId, stepId, disabled, narrationId, segments }: Props & { narrationId?: string, segments: string[] }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = TRANSCRIPTION_MESSAGES[locale], source = useWorkbenchState(state => state.authoring)
  const key = `presmium.transcription-draft.v1:${JSON.stringify([identity, candidate.transcriptionId, candidate.revision, stepId, narrationId, segments])}`
  const [restored] = useState(() => restore(key)), [draft, setDraft] = useState(restored.draft), latest = useRef(draft)
  const [storageFailed, setStorageFailed] = useState(restored.failed), [composing, setComposing] = useState(false)
  const [plan, setPlan] = useState<TranscriptionAdoptionPlan>(), [reviewing, setReviewing] = useState(false), [applying, setApplying] = useState(false), [open, setOpen] = useState(false), [failure, setFailure] = useState<string>(), [status, setStatus] = useState<string>()
  const editor = useRef<NativeNarrationEditor>(), generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const binding: CanonicalSource = { documentId: document.id, version: source?.version ?? '', fingerprint: source?.fingerprint ?? '' }
  const references = narrationId ? Object.values(document.steps).filter(step => step.narrationIds.includes(narrationId)).map(step => step.id) : []
  const target = { sectionId, stepId, ...narrationId ? { narrationId } : {}, segmentIds: segments, ...references.length > 1 ? { shared: draft.shared, ...draft.shared === 'edit-shared' ? { affectedStepIds: references } : {} } : {} }
  const baseline = useMemo(() => prepareTranscriptionAdoption(document, candidate, { id: draft.id, source: binding, candidate: { id: candidate.transcriptionId, revision: candidate.revision }, draftRevision: draft.revision, targets: [target] }), [document, candidate, draft.id, draft.shared, sectionId, stepId, narrationId, segments.join('\0'), binding.version, binding.fingerprint])
  const original = baseline.targets[0], atoms = original?.atoms ?? []
  const proposed = original?.proposed.map(node => {
    if (node.type !== 'cue') return node
    const previous = baseline.impact.forks.flatMap(fork => fork.cues).find(cue => cue.to === node.id)
    return previous ? atoms.find(atom => atom.node.type === 'cue' && atom.node.id === previous.from)?.node ?? node : node
  })
  const nodes = draft.nodes ?? proposed ?? [{ type: 'text' as const, text: candidate.result.segments.filter(value => segments.includes(value.id)).map(value => value.text).join('\n') }]
  const content = (): { parts: TranscriptionAdoptionPart[], used: Set<string>, invalid: boolean } => {
    const used = new Set<string>(), parts: TranscriptionAdoptionPart[] = []; let invalid = false
    for (const node of latest.current.nodes ?? nodes) {
      if (node.type === 'text') parts.push({ type: 'text', text: node.text })
      else {
        const atom = atoms.find(atom => !used.has(atom.key) && same(atom.node, node))
        if (!atom) invalid = true
        else { used.add(atom.key); parts.push({ type: 'preserve', key: atom.key }) }
      }
    }
    return { parts, used, invalid }
  }
  const parsed = content(), sourceReady = Boolean(source?.identity === identity && source.version && source.fingerprint && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error)
  const planCurrent = Boolean(plan && plan.source.version === source?.version && plan.source.fingerprint === source?.fingerprint)
  const change = (patch: Partial<Draft>) => {
    generation.current++
    const next = { ...latest.current, ...patch, revision: latest.current.revision + 1, applied: false }
    latest.current = next; setDraft(next); setPlan(undefined); setFailure(undefined); setStatus(undefined)
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageFailed(false) } catch { setStorageFailed(true) }
  }
  const pause = () => { workbench.stopAuditions(); void workbench.pausePlayback().catch(() => {}) }
  const preview = async () => {
    const now = workbench.getState().authoring
    if (disabled || reviewing || applying || composing || !sourceReady || !now?.version || !now.fingerprint || parsed.invalid) return
    pause()
    if (latest.current.baseVersion && latest.current.baseVersion !== now.version) change({ id: crypto.randomUUID(), baseVersion: now.version })
    else if (!latest.current.baseVersion) change({ baseVersion: now.version })
    const value = latest.current, request = ++generation.current, normalized = content()
    const retainsOriginal = references.length > 1 && value.shared === 'fork'
    const removeCueTimings = atoms.filter(atom => value.discarded.includes(atom.key) && atom.node.type === 'cue' && !retainsOriginal && Object.hasOwn(document.production.cueTimings ?? {}, atom.node.id)).map(atom => (atom.node as Extract<NarrationNode, { type: 'cue' }>).id)
    const sent: TranscriptionAdoptionDraft = { id: value.id, source: { documentId: document.id, version: now.version, fingerprint: now.fingerprint }, candidate: { id: candidate.transcriptionId, revision: candidate.revision }, draftRevision: value.revision, targets: [{ ...target, content: normalized.parts, discardAtoms: value.discarded.filter(key => atoms.some(atom => atom.key === key)) }], ...removeCueTimings.length ? { removeCueTimings } : {} }
    setReviewing(true); setFailure(undefined)
    try {
      const answer = await workbench.planDocumentTranscription(sent, { identity, version: now.version })
      if (request !== generation.current || latest.current.revision !== sent.draftRevision) return
      setPlan(answer); setOpen(true)
    } catch { if (request === generation.current) setFailure(t.previewFailed) }
    finally { setReviewing(false) }
  }
  const apply = async () => {
    if (!plan?.planId || !planCurrent || plan.conflicts.length || plan.draftRevision !== latest.current.revision || composing || applying || !sourceReady) return
    const sent = plan, planId = plan.planId
    setApplying(true); setFailure(undefined)
    try {
      const answer = await workbench.adoptDocumentTranscription({ planId, source: sent.source, candidate: sent.candidate, draftRevision: sent.draftRevision }, { identity, version: sent.source.version })
      if (latest.current.id === sent.changeId && latest.current.revision === sent.draftRevision) {
        const next: Draft = { ...latest.current, id: crypto.randomUUID(), revision: 0, discarded: [], baseVersion: answer.version, applied: true }
        latest.current = next; setDraft(next)
        try { localStorage.setItem(key, JSON.stringify(next)); setStorageFailed(false) } catch { setStorageFailed(true) }
      }
      setPlan(undefined); setOpen(false); setStatus(t.adopted)
    } catch { setFailure(t.applyFailed) }
    finally { setApplying(false) }
  }
  if (!displayed(nodes).trim() && !atoms.length) return <span>{t.empty}</span>
  return <>
    <PmField label={t.text} group><NarrationEditor identity={key} narrationId={original?.outputNarrationId ?? draft.id} content={nodes} getContent={() => latest.current.nodes ?? nodes} locale={locale} advanced={false} readOnly={disabled || applying}
      onReady={value => { editor.current = value }} onComposition={setComposing} onFocus={pause} onChange={value => {
        const used = new Set<string>()
        for (const node of value) { const atom = atoms.find(atom => !used.has(atom.key) && same(atom.node, node)); if (atom) used.add(atom.key) }
        change({ nodes: value, discarded: latest.current.discarded.filter(key => !used.has(key)) })
      }} /></PmField>
    {references.length > 1 && <PmSelect label={t.shared} value={draft.shared} disabled={disabled || applying} onChange={event => change({ shared: event.target.value as Draft['shared'] })}><option value="fork">{t.fork}</option><option value="edit-shared">{t.editShared}</option></PmSelect>}
    {atoms.length > 0 && <details open={atoms.some(atom => !parsed.used.has(atom.key) && !draft.discarded.includes(atom.key)) || undefined}><summary>{t.atoms}</summary><div className="pmw-transcription__atoms">{atoms.map(atom => {
      const used = parsed.used.has(atom.key), removed = draft.discarded.includes(atom.key)
      const cleanup = atom.node.type === 'cue' && Object.hasOwn(document.production.cueTimings ?? {}, atom.node.id) && !(references.length > 1 && draft.shared === 'fork')
      return <div key={atom.key} className="pmw-transcription__actions"><span>{atom.node.type === 'pronunciation' ? `${t.pronunciation} · ${atom.node.display} → ${atom.node.spoken}` : `${t.cue} ${atoms.indexOf(atom) + 1}`}</span>
        {used ? <PmBadge tone="ok">{t.atoms}</PmBadge> : <>
          <PmButton small disabled={disabled || applying || composing} onClick={() => { const field = editor.current; if (!field) return; field.focus(); field.insertInlineContent(narrationToNative('adoption-atom', [atom.node])[0]!.content ?? []) }}>{t.keepAtom}</PmButton>
          <PmButton small aria-pressed={removed} disabled={disabled || applying} onClick={() => change({ discarded: removed ? draft.discarded.filter(key => key !== atom.key) : [...draft.discarded, atom.key] })}>{cleanup ? t.removeTiming : t.removeAtom}</PmButton>
        </>}
      </div>
    })}</div></details>}
    {parsed.invalid && <PmNotice tone="warn">{t.unknownAtom}</PmNotice>}
    {storageFailed && <PmNotice tone="warn">{t.draftStorage}</PmNotice>}
    {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    {status && <span role="status">{status}</span>}
    <div className="pmw-transcription__actions"><PmButton small variant="primary" loading={reviewing} disabled={disabled || !sourceReady || composing || applying || parsed.invalid || draft.applied} onClick={() => void preview()}>{t.review}</PmButton></div>
    {open && plan && <PmDialog open label={t.confirm} closeLabel={t.edit} busy={applying} onClose={() => setOpen(false)} footer={<><PmButton disabled={applying} onClick={() => setOpen(false)}>{t.edit}</PmButton><PmButton variant="primary" loading={applying} disabled={!plan.planId || !planCurrent || plan.conflicts.length > 0 || !sourceReady || composing || plan.draftRevision !== draft.revision} onClick={() => void apply()}>{t.apply}</PmButton></>}>
      <div className="pmw-transcription__review"><PmTextarea label={t.before} readOnly value={displayed(plan.targets[0]?.before ?? [])} /><PmTextarea label={t.after} readOnly value={displayed(plan.targets[0]?.proposed ?? [])} /></div>
      {plan.impact.stepIds.length > 1 && <PmNotice tone="warn">{t.affected(plan.impact.stepIds.length)}</PmNotice>}
      {plan.conflicts.length > 0 && <PmNotice tone="warn">{t.conflicts}</PmNotice>}
      {!planCurrent && <PmNotice tone="warn">{t.sourceChanged}</PmNotice>}
      {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    </PmDialog>}
  </>
}
