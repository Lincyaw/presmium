import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { applyDocumentComponentAction, effectiveComponentParameters, isRecord, validateDocumentParameters } from '@lincyaw/kernel'
import type { CanonicalSource, DocumentComponentAction, DocumentParameterValidation, JsonObject, TeachingDocument } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmNotice, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { isAgentChanging } from '../workbench.ts'
import { COMPONENT_PROPERTY_MESSAGES } from '../component-property-messages.ts'
import type { ComponentPropertyMessages } from '../component-property-messages.ts'
import { componentPropertyAction, componentSource, rebaseComponentPropertyDraft, sameComponentSource } from '../component-properties.ts'
import type { ComponentPropertyBackup, ComponentPropertyBackupRead, ComponentPropertyDraft, ComponentPropertyTarget } from '../component-property-drafts.ts'
import { PmSchemaForm, schemaFormPropertyNames } from '../schema-form/PmSchemaForm.tsx'
import { ComponentMaterials, componentDefinitionLabel } from './ComponentMaterials.tsx'

const subscribeEmpty = () => () => {}, snapshotEmpty = () => 0
const targetKey = (target: ComponentPropertyTarget) => JSON.stringify([target.identity, target.memberId, target.blockId, target.stepId ?? null])
function fresh(document: TeachingDocument, source: CanonicalSource, target: ComponentPropertyTarget): ComponentPropertyDraft {
  const block = document.blocks[target.blockId]
  if (block?.type !== 'component') throw new Error('component-block-missing')
  const value = effectiveComponentParameters(document, block.id, target.stepId).parameters
  return { format: 1, id: crypto.randomUUID(), revision: 0, target, source, definitionId: block.definitionId, baseline: value, value,
    composing: false, reset: false, updatedAt: new Date().toISOString() }
}
function message(error: unknown, t: ComponentPropertyMessages): string {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('definition-changed')) return t.definitionChanged
  if (/source|context|version|identity/.test(code)) return t.changed
  if (/permission|forbidden|review-required/.test(code)) return t.denied
  if (/draft-limit/.test(code)) return t.limit
  if (/missing|owner/.test(code)) return t.missing
  if (/parameter.*invalid|schema|readonly/.test(code)) return t.invalid
  return t.failed
}
interface Applied { commitId?: string, source: CanonicalSource }
interface Intent { draft?: ComponentPropertyDraft, signature: string, id: string }

/** One source-bound form; the existing draft bank and canonical actor own every retained value. */
export function ComponentPropertiesDialog({ identity, blockId, stepId, onClose }: {
  identity: string, blockId: string, stepId?: string, onClose(): void,
}) {
  const workbench = useWorkbench(), state = useWorkbenchState(value => value), locale = state.locale, t = COMPONENT_PROPERTY_MESSAGES[locale]
  const source = state.authoring?.identity === identity ? state.authoring : undefined
  const document = source?.content, block = document?.blocks[blockId], definition = block?.type === 'component' ? document?.definitions[block.definitionId] : undefined
  const bank = useMemo(() => workbench.documentPropertyDrafts(identity), [workbench, identity])
  const revision = useSyncExternalStore(bank?.subscribe ?? subscribeEmpty, bank?.snapshot ?? snapshotEmpty)
  const [scope, setScope] = useState<'base' | 'step'>('base'), [page, setPage] = useState<'parameters' | 'materials'>('parameters')
  const target = useMemo<ComponentPropertyTarget>(() => ({ identity, memberId: source?.member?.id ?? '', blockId, ...scope === 'step' && stepId ? { stepId } : {} }), [identity, source?.member?.id, blockId, scope, stepId])
  const key = targetKey(target)
  const [ready, setReady] = useState(false), [openAttempt, setOpenAttempt] = useState(0), [initial, setInitial] = useState<{ key: string, draft: ComponentPropertyDraft }>()
  const [error, setError] = useState<string>(), [busy, setBusy] = useState(false), [validation, setValidation] = useState<DocumentParameterValidation>()
  const [applied, setApplied] = useState<Applied>(), [backups, setBackups] = useState<ComponentPropertyBackupRead>(), [backupError, setBackupError] = useState(false)
  const [backupIndex, setBackupIndex] = useState(0), [backupRead, setBackupRead] = useState(0), [backupBusy, setBackupBusy] = useState(false)
  const [material, setMaterial] = useState<{ definitionId: string, source: CanonicalSource }>()
  const flight = useRef<AbortController>(), backupFlight = useRef<AbortController>(), intent = useRef<Intent>(), mounted = useRef(true), locateOnClose = useRef(false)
  const ownedInput = useRef(new Map<string, ComponentPropertyDraft>())
  const current = useRef({ key, source, target, scope, page, busy })
  current.current = { key, source, target, scope, page, busy }
  const close = () => { flight.current?.abort(); backupFlight.current?.abort(); onClose() }
  useEffect(() => () => backupFlight.current?.abort(), [key])
  useEffect(() => {
    mounted.current = true
    let active = true
    if (workbench.getState().authoring?.identity !== identity) { setError(t.changed); return () => { active = false; mounted.current = false; flight.current?.abort() } }
    void workbench.flushPendingEdits().then(() => {
      if (!active) return
      const source = workbench.getState().authoring
      if (source?.identity !== identity || !source.content || !source.version || !source.fingerprint || source.dirty || source.saving || source.composing || source.error || source.restored) { setError(t.changed); return }
      setReady(true)
    }, () => { if (active) setError(t.failed) })
    return () => { active = false; mounted.current = false; flight.current?.abort() }
  }, [workbench, identity, openAttempt])
  useEffect(() => {
    if (!ready || !bank || !document || !source?.version || !source.fingerprint || block?.type !== 'component' || !target.memberId || busy) return
    if (scope === 'step' && !stepId) return
    if (initial?.key === key && (bank.get(target) || sameComponentSource(initial.draft.source, componentSource({ content: document, version: source.version, fingerprint: source.fingerprint })))) return
    try { setInitial({ key, draft: fresh(document, componentSource({ content: document, version: source.version, fingerprint: source.fingerprint }), target) }) }
    catch (error) { setError(message(error, t)) }
  }, [ready, bank, key, revision, source?.version, source?.fingerprint, busy, initial])
  const draft = bank?.get(target) ?? (initial?.key === key ? initial.draft : undefined)
  const stored = bank?.get(target)
  const editable = workbench.client.capabilities?.readOnly !== true && Boolean(source?.member?.roles.some(role => role === 'editor' || role === 'owner'))
  const clean = Boolean(source?.version && source.fingerprint && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.recovering && !source.error
    && editable && !state.isHistoryBusy && !state.isHistoryPreparing && !isAgentChanging(state))
  const canonical = document && source?.version && source.fingerprint ? componentSource({ content: document, version: source.version, fingerprint: source.fingerprint }) : undefined
  const stale = Boolean(draft && (!canonical || !sameComponentSource(draft.source, canonical) || block?.type !== 'component' || block.definitionId !== draft.definitionId))
  const preview = useMemo(() => {
    if (!document || !draft || stale) return {}
    try { const action = componentPropertyAction(draft); return action ? { action, effect: applyDocumentComponentAction(document, action).effect } : {} }
    catch (error) { return { error: message(error, t) } }
  }, [document, draft, stale, t])
  const keep = useCallback((value: JsonObject, composing?: boolean, reset = false) => {
    const latest = current.current
    if (!bank || !draft || latest.key !== key) return
    const record = bank.get(target) ?? draft
    try {
      const activeComposition = composing ?? record.composing
      const saved = bank.keep(target, { source: record.source, definitionId: record.definitionId, baseline: record.baseline, value, composing: activeComposition, reset })
      ownedInput.current.set(key, saved)
      const source = latest.source, block = source?.content?.blocks[target.blockId]
      // An unchanged idle field has no pending intent. During a write, even a return
      // to the old baseline remains later input and must survive its acknowledgement.
      if (!flight.current && !latest.busy && !activeComposition && !reset && source?.content && source.version && source.fingerprint && block?.type === 'component'
        && block.definitionId === saved.definitionId && sameComponentSource(saved.source, componentSource({ content: source.content, version: source.version, fingerprint: source.fingerprint }))
        && !componentPropertyAction(saved)) void bank.clear(saved)
      setError(undefined)
    }
    catch (error) { setError(message(error, t)) }
  }, [bank, draft, key, target, t])
  const composition = (composing: boolean) => {
    const record = bank?.get(target) ?? draft
    if (!bank || !record) return
    if (current.current.key === key) { keep(record.value, composing, record.reset); return }
    // A field leaving its scope may end only the preedit revision it still owns.
    if (!composing && record.composing && ownedInput.current.get(key) === record && bank.canKeep(target)) {
      const saved = bank.keep(target, { source: record.source, definitionId: record.definitionId, baseline: record.baseline, value: record.value, reset: record.reset, composing: false })
      ownedInput.current.set(key, saved)
    }
  }
  useEffect(() => {
    if (!ready || !bank || !target.memberId) return
    const controller = new AbortController(), expected = key
    setBackups(undefined); setBackupError(false); setBackupIndex(0)
    void bank.read(target, controller.signal).then(value => { if (mounted.current && current.current.key === expected) setBackups(value) }, () => {
      if (!controller.signal.aborted && mounted.current && current.current.key === expected) setBackupError(true)
    })
    return () => controller.abort()
  }, [ready, bank, key, backupRead])
  const recheck = () => {
    if (!draft || !document || !canonical || !bank || !clean) return
    try {
      const value = rebaseComponentPropertyDraft(document, draft), baseline = effectiveComponentParameters(document, blockId, target.stepId).parameters
      bank.keep(target, { source: canonical, definitionId: draft.definitionId, baseline, value, reset: draft.reset, composing: false })
      setError(undefined); intent.current = undefined
    } catch (error) { setError(message(error, t)) }
  }
  const restore = async (backup: ComponentPropertyBackup) => {
    if (!bank || !draft || backupBusy || bank.status(target) !== 'available' || draft.composing) return
    const expected = key, previous = bank.get(target), controller = new AbortController()
    backupFlight.current = controller
    setBackupBusy(true)
    try {
      const answer = await bank.read(target, controller.signal)
      if (!mounted.current || current.current.key !== expected) return
      if (bank.get(target) !== previous || !answer.candidates.some(value => value.key === backup.key && value.token === backup.token)) { setError(t.backupChanged); setBackupRead(value => value + 1); return }
      const recovered = await bank.recover(backup, previous, controller.signal)
      if (!mounted.current || current.current.key !== expected) return
      if (!recovered) setError(t.backupChanged)
      else setError(undefined)
      setBackupRead(value => value + 1)
    } catch { if (!controller.signal.aborted && mounted.current && current.current.key === expected) setBackupError(true) }
    finally { if (backupFlight.current === controller) backupFlight.current = undefined; if (mounted.current) setBackupBusy(false) }
  }
  const discardBackup = async (backup: ComponentPropertyBackup) => {
    if (!bank || backupBusy) return
    const expected = key, controller = new AbortController(); backupFlight.current = controller; setBackupBusy(true)
    try { const done = await bank.discard(backup, controller.signal); if (mounted.current && current.current.key === expected) { if (!done) setError(t.backupChanged); setBackupRead(value => value + 1) } }
    catch { if (!controller.signal.aborted && mounted.current && current.current.key === expected) setBackupError(true) }
    finally { if (backupFlight.current === controller) backupFlight.current = undefined; if (mounted.current) setBackupBusy(false) }
  }
  const discardLocal = async () => {
    if (!bank || !stored || busy) return
    const expected = key
    if (await bank.clear(stored) && mounted.current && current.current.key === expected) { setInitial(undefined); setError(undefined) }
  }
  const submit = async (action: DocumentComponentAction, submitted?: ComponentPropertyDraft) => {
    if (!canonical || !source?.version || !clean || current.current.busy) return
    const expected = { identity, version: source.version, fingerprint: source.fingerprint! }, signature = JSON.stringify([canonical, action])
    if (!intent.current || intent.current.signature !== signature || intent.current.draft !== submitted) intent.current = { signature, draft: submitted, id: crypto.randomUUID() }
    const captured = intent.current, controller = new AbortController(), submittedKey = key
    flight.current = controller; current.current.busy = true; setBusy(true); setError(undefined)
    try {
      const plan = await workbench.planDocumentComponentAction(action, captured.id, expected, controller.signal)
      if (submitted && bank?.get(submitted.target) !== submitted) return
      const result = await workbench.applyDocumentComponentPlan(plan, expected, controller.signal)
      if (submitted) await bank?.clear(submitted)
      if (!mounted.current || current.current.key !== submittedKey) return
      setApplied({ commitId: result.commitId, source: componentSource(result.answer) })
      if (current.current.page === 'materials' && action.type === 'component.definition.use') setMaterial({ definitionId: action.definitionId, source: componentSource(result.answer) })
      intent.current = undefined
    } catch (error) {
      if (mounted.current && current.current.key === submittedKey) setError(message(error, t))
    } finally { if (flight.current === controller) flight.current = undefined; current.current.busy = false; if (mounted.current) setBusy(false) }
  }
  const undo = async () => {
    if (!applied?.commitId || !canonical || !sameComponentSource(applied.source, canonical) || !clean || current.current.busy || bank?.has(identity, target.memberId)) return
    const expected = key; current.current.busy = true; setBusy(true); setError(undefined)
    try { if (!await workbench.revertRevision(applied.commitId)) { if (mounted.current && current.current.key === expected) setError(t.failed); return }; if (mounted.current && current.current.key === expected) { setApplied(undefined); setInitial(undefined) } }
    catch (error) { if (mounted.current && current.current.key === expected) setError(message(error, t)) }
    finally { current.current.busy = false; if (mounted.current) setBusy(false) }
  }
  const retrySource = async () => {
    if (current.current.busy || workbench.getState().authoring?.identity !== identity) return
    const expected = key; current.current.busy = true; setBusy(true); setError(undefined)
    try { await workbench.retryDocument(); if (mounted.current && current.current.key === expected && !ready) setOpenAttempt(value => value + 1) }
    catch (error) { if (mounted.current && current.current.key === expected) setError(message(error, t)) }
    finally { current.current.busy = false; if (mounted.current) setBusy(false) }
  }
  const enterMaterials = () => {
    if (!canonical || block?.type !== 'component') return
    setMaterial(before => before ?? { definitionId: block.definitionId, source: canonical }); setPage('materials'); setError(undefined)
  }
  const materialAction: DocumentComponentAction | undefined = material && block?.type === 'component' && material.definitionId !== block.definitionId
    ? { type: 'component.definition.use', blockId, definitionId: material.definitionId } : undefined
  let materialValid = false
  if (document && materialAction && document.definitions[materialAction.definitionId]?.implementation.type !== 'module') {
    try { materialValid = applyDocumentComponentAction(document, materialAction).effect.changed } catch { /* Disabled choice carries the compatibility reason. */ }
  }
  const materialStale = Boolean(material && (!canonical || !sameComponentSource(material.source, canonical)))
  const canUndo = Boolean(applied?.commitId && canonical && sameComponentSource(applied.source, canonical) && clean && !busy && !materialAction && !bank?.has(identity, target.memberId))
  const canApply = Boolean(!busy && clean && ready && (page === 'materials' ? materialAction && materialValid && !materialStale : preview.action && preview.effect?.changed && !stale && !draft?.composing && validation?.valid))
  const selectedBackup = backups?.candidates[backupIndex]
  let inherited: ReturnType<typeof effectiveComponentParameters> | undefined
  try { if (document && stepId) inherited = effectiveComponentParameters(document, blockId, stepId) } catch { /* The missing source is reported below. */ }
  const stateSchema = scope === 'step' ? definition?.states.find(item => item.id === inherited?.visual?.state)?.parameterSchema : undefined
  const baseNames = useMemo(() => definition && draft ? schemaFormPropertyNames(definition.parameterSchema, draft.value) : undefined, [definition, draft?.value])
  const extraValidation = useCallback((value: Parameters<typeof validateDocumentParameters>[1]) => {
    return stateSchema !== undefined ? validateDocumentParameters(stateSchema, value) : { available: true, valid: true, issues: [] }
  }, [stateSchema])
  const name = definition ? componentDefinitionLabel(definition) : t.properties
  return <PmDialog open label={page === 'materials' ? t.materials : name} closeLabel={applied ? t.done : t.cancel} onClose={close}
    onCloseAutoFocus={event => { if (locateOnClose.current) event.preventDefault() }}
    footer={<>{page === 'materials' && <PmButton onClick={() => setPage('parameters')}>{t.back}</PmButton>}
      {applied?.commitId && <PmButton disabled={!canUndo} onClick={() => void undo()}>{t.undo}</PmButton>}
      <PmButton onClick={close}>{applied ? t.done : t.cancel}</PmButton>
      <PmButton variant="primary" loading={busy} disabled={!canApply} onClick={() => {
        const action = page === 'materials' ? materialAction : preview.action
        if (action) void submit(action, page === 'parameters' ? stored : undefined)
      }}>{page === 'materials' ? t.adopt : t.apply}</PmButton></>}>
    <div className="component-properties__content">
      {error && !((stale || materialStale || source?.error) && error === t.changed) && <PmNotice tone="danger">{error}</PmNotice>}
      {!ready && error && <PmButton disabled={busy || !source} onClick={() => void retrySource()}>{t.retry}</PmButton>}
      {!ready && !error && <PmNotice>{t.loading}</PmNotice>}
      {ready && source?.error && <PmNotice tone="warn">{t.changed}<PmButton small disabled={busy} onClick={() => void retrySource()}>{t.retry}</PmButton></PmNotice>}
      {ready && (!document || block?.type !== 'component' || !definition) && <PmNotice tone="warn">{t.missing}</PmNotice>}
      {ready && document && definition && block?.type === 'component' && page === 'materials' && <>
        {materialStale && <PmNotice tone="warn">{t.changed}<PmButton small disabled={!clean || busy} onClick={() => { if (canonical) { setMaterial(value => value && { ...value, source: canonical }); setError(undefined) } }}>{t.recheck}</PmButton></PmNotice>}
        <ComponentMaterials document={document} blockId={blockId} selected={material?.definitionId ?? block.definitionId} disabled={busy}
          messages={t} onSelect={definitionId => setMaterial(value => ({ definitionId, source: value?.source ?? canonical! }))}
          onLocate={id => { locateOnClose.current = true; close(); workbench.revealDocumentComponent(id, identity) }} />
      </>}
      {ready && document && definition && draft && page === 'parameters' && <>
        <PmSelect label={t.scope} value={scope} onChange={event => { setScope(event.currentTarget.value as 'base' | 'step'); setError(undefined); setValidation(undefined) }}>
          <option value="base">{t.base}</option><option value="step" disabled={!stepId}>{t.step}</option>
        </PmSelect>
        {stale && <PmNotice tone="warn">{t.changed}<PmButton small disabled={!clean || busy} onClick={recheck}>{t.recheck}</PmButton></PmNotice>}
        {stored && (stale || error) && <PmButton small variant="ghost" disabled={busy} onClick={() => void discardLocal()}>{t.discardChanges}</PmButton>}
        {preview.effect && <span>{t.impact(preview.effect.affected.steps.length)}{scope === 'base' ? ` · ${t.preserved}` : ''}</span>}
        {preview.error && <PmNotice tone="danger">{preview.error}</PmNotice>}
        {bank?.status(target) === 'session-only' && <PmNotice tone="warn">{t.storage}</PmNotice>}
        {!bank?.canKeep(target) && <PmNotice tone="warn">{t.limit}</PmNotice>}
        {draft.reset && <PmNotice>{t.resetPending}</PmNotice>}
        <PmSchemaForm key={key} schema={definition.parameterSchema} value={draft.value} locale={locale} label={t.properties} empty={stateSchema !== undefined ? null : t.empty}
          accessorSchemas={stateSchema !== undefined ? [stateSchema] : undefined}
          readOnly={!editable || draft.reset} disabled={!bank?.canKeep(target)} extraValidation={scope === 'step' ? extraValidation : undefined}
          onValidationChange={setValidation} onComposition={composition}
          onChange={value => { if (isRecord(value)) keep(value as JsonObject) }} />
        {stateSchema !== undefined && <PmSchemaForm key={`${key}:state`} schema={stateSchema} value={draft.value} locale={locale} label={t.properties} empty={null}
          accessorSchemas={[definition.parameterSchema]}
          hideProperties={baseNames?.available ? baseNames.names : undefined} readOnly={!editable || draft.reset} disabled={!bank?.canKeep(target)}
          onComposition={composition}
          onChange={value => { if (isRecord(value)) keep(value as JsonObject) }} />}
        <div className="component-properties__actions">
          {scope === 'step' && inherited?.ownParameters !== undefined && <PmButton small disabled={busy} onClick={() => {
            try {
              if (draft.reset) keep(draft.baseline)
              else { const reset = applyDocumentComponentAction(document, { type: 'component.step-parameters.reset', blockId, stepId: target.stepId! }).content; keep(effectiveComponentParameters(reset, blockId, target.stepId).parameters, false, true) }
            } catch (error) { setError(message(error, t)) }
          }}>{draft.reset ? t.edit : t.reset}</PmButton>}
          <PmButton variant="ghost" onClick={enterMaterials}>{t.materials}</PmButton>
        </div>
        {backupError && <PmNotice tone="warn">{t.storageRead}<PmButton small onClick={() => setBackupRead(value => value + 1)}>{t.retry}</PmButton></PmNotice>}
        {Boolean(backups?.unreadable) && <PmNotice tone="warn">{t.unreadable}</PmNotice>}
        {Boolean(backups?.candidates.length) && <div className="component-properties__backups">
          <PmSelect label={t.backup} value={backupIndex} disabled={backupBusy} onChange={event => setBackupIndex(Number(event.currentTarget.value))}>
            {backups!.candidates.map((backup, index) => <option value={index} key={backup.key + backup.token}>{new Date(backup.record.updatedAt).toLocaleString(locale)} · {index + 1}</option>)}
          </PmSelect>
          <div className="component-properties__actions"><PmButton small disabled={!selectedBackup || backupBusy || busy || draft.composing || !bank?.canKeep(target) || bank?.status(target) !== 'available'} onClick={() => selectedBackup && void restore(selectedBackup)}>{t.recover}</PmButton>
            <PmButton small disabled={!selectedBackup || backupBusy} onClick={() => selectedBackup && void discardBackup(selectedBackup)}>{t.discard}</PmButton></div>
        </div>}
      </>}
    </div>
  </PmDialog>
}
