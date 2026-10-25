import { useEffect, useRef, useState } from 'react'
import type { VoiceScope, VoiceSettingsAnswer, VoiceTarget } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmCard, PmDialog, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { VoiceScopeField, voiceScopeContains } from './VoiceScopeField.tsx'

/** Job progress and clip availability are read from the service; opening this dialog never synthesizes. */
export function VoiceoverDialog({ document, target, initial, onClose }: { document: string, target: VoiceTarget, initial: VoiceSettingsAnswer, onClose(): void }) {
  const workbench = useWorkbench()
  const locale = useWorkbenchState(state => state.locale), t = VOICE_MESSAGES[locale]
  const doc = useWorkbenchState(state => state.ir?.doc)
  const revision = useWorkbenchState(state => state.ir?.revision)
  const snapshot = useWorkbenchState(state => state.voiceover)
  const failure = useWorkbenchState(state => state.voiceoverFailure)
  const starting = useWorkbenchState(state => Boolean(state.voiceoverStarting))
  const cancelling = useWorkbenchState(state => state.voiceoverCancelPending)
  const [scope, setScope] = useState<VoiceScope>({ kind: 'step', target })
  const [settings, setSettings] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [localFailure, setLocalFailure] = useState<string>()
  const live = useRef(true)
  useEffect(() => { live.current = true; workbench.readVoiceover(); return () => { live.current = false } }, [workbench, document])
  const busy = starting || submitting
  const stale = revision !== settings.revision || snapshot?.revision !== settings.revision
  const steps = snapshot?.steps.filter(step => voiceScopeContains(scope, step.target)) ?? []
  const missing = steps.filter(step => step.state === 'missing')
  const unbound = snapshot?.unboundByPage?.filter(page => scope.kind === 'document' || scope.kind === 'page' && page.section === scope.section) ?? []
  const missingCount = missing.length + unbound.filter(page => page.state === 'missing').length
  const selectedTargets = scope.kind === 'step' ? [scope.target] : scope.kind === 'steps' ? scope.targets : []
  const unavailableStep = selectedTargets.map(target => settings.steps.find(step => step.target.section === target.section && step.target.step === target.step && step.target.binding === target.binding)).find(step => !step?.editable)
  const stepScopeBlocked = selectedTargets.some(target => !settings.steps.some(step => step.target.section === target.section && step.target.step === target.step && step.target.binding === target.binding && step.editable))
  const defaultEngine = snapshot?.capability.defaultEngine
  const providerIds = new Set(settings.steps.filter(step => voiceScopeContains(scope, step.target) && step.voice).map(step => step.voice!.engine ?? defaultEngine))
  const providers = snapshot?.capability.providers.filter(provider => provider.tts && providerIds.has(provider.id)) ?? []
  const start = async () => {
    if (!snapshot || stale || busy || !missingCount || stepScopeBlocked || !snapshot.capability.available) return
    setSubmitting(true); setLocalFailure(undefined)
    try { await workbench.startVoiceover({ revision: settings.revision, scope, confirmed: true }) }
    catch (error) { if (live.current) setLocalFailure(voiceFailure(error, locale)) }
    finally { if (live.current) setSubmitting(false) }
  }
  const recheck = async () => {
    setSubmitting(true); setLocalFailure(undefined)
    try {
      const next = await workbench.client.readVoiceSettings(document, target.section, target.step)
      if (!live.current) return
      if (!next.selected) throw new Error('voice-context-changed')
      setSettings(next); setScope({ kind: 'step', target: next.selected.target }); workbench.readVoiceover()
    } catch (error) { if (live.current) setLocalFailure(voiceFailure(error, locale)) }
    finally { if (live.current) setSubmitting(false) }
  }
  if (!doc) return null
  return <PmDialog open label={t.generation} description={t.missingOnly} closeLabel={t.close} busy={busy} onClose={onClose}>
    <div className="pmw-operation">
      <VoiceScopeField settings={settings} doc={doc} target={settings.selected?.target ?? target} value={scope} disabled={busy} onChange={setScope} />
      {(localFailure || failure) && <PmNotice tone="danger">{localFailure ?? voiceFailure(new Error(failure), locale)}</PmNotice>}
      {stale && <PmNotice tone="warn">{t.changed}<PmButton small disabled={busy} onClick={() => void recheck()}>{t.recheck}</PmButton></PmNotice>}
      {!snapshot && !failure && <p role="status">{t.refreshing}</p>}
      {stepScopeBlocked && <PmNotice tone="warn">{unavailableStep?.reason === 'script-file' ? t.scriptFile : unavailableStep?.reason === 'cue-step' ? t.cueStep : t.changed}</PmNotice>}
      {snapshot && !snapshot.capability.available && <PmNotice tone="warn">{snapshot.capability.reason === 'voice-unset' ? t.unset : snapshot.capability.reason === 'step-binding-stale' ? t.changed : t.noService}</PmNotice>}
      <PmCard><div className="pmw-operation">
        {steps.filter(step => step.utterances > 0 || !unbound.some(page => page.section === step.target.section && page.utterances > 0)).map(step => {
          const page = doc.sections.findIndex(page => page.id === step.target.section) + 1
          return <div className="pmw-voice__status" key={JSON.stringify(step.target)}><span>{t.step(page, step.target.step + 1)}</span><PmBadge tone={step.state === 'ready' ? 'ok' : step.state === 'blocked' ? 'warn' : 'neutral'}>{t.statuses[step.state]}</PmBadge></div>
        })}
        {unbound.map(page => <div className="pmw-voice__status" key={page.section}><span>{t.pageScript(doc.sections.findIndex(section => section.id === page.section) + 1)}</span><PmBadge tone={page.state === 'ready' ? 'ok' : page.state === 'blocked' ? 'warn' : 'neutral'}>{t.statuses[page.state]}</PmBadge></div>)}
        {snapshot && !stepScopeBlocked && !steps.some(step => step.utterances > 0) && !unbound.some(page => page.utterances > 0) && <p>{t.noScript}</p>}
      </div></PmCard>
      {missingCount > 0 && !stepScopeBlocked && snapshot?.capability.available && providers.map(provider => <PmNotice key={provider.id}>{t.disclosure(provider.provider, provider.local)}</PmNotice>)}
      <div className="pmw-operation__actions"><PmButton small disabled={busy} onClick={() => workbench.readVoiceover()}>{t.refresh}</PmButton><PmButton variant="primary" loading={busy} disabled={!snapshot || stale || stepScopeBlocked || !missingCount || !snapshot.capability.available} onClick={() => void start()}>{t.confirmGenerate}</PmButton></div>
      {snapshot?.jobs.map(job => <PmCard key={job.id}><div className="pmw-operation">
        <div className="pmw-voice__status"><PmBadge tone={job.state === 'done' ? 'ok' : job.state === 'failed' || job.state === 'stale' ? 'warn' : 'neutral'}>{t.jobs[job.state]}</PmBadge>{job.revision !== revision && <span>{t.oldVersion}</span>}</div>
        <span>{t.progress(job.completed, job.total, job.failed)}</span>
        {job.error && <PmNotice tone="danger">{voiceFailure(new Error(job.error), locale)}</PmNotice>}
        {(['queued', 'running', 'cancelling'] as string[]).includes(job.state) && <PmButton small loading={cancelling === job.id} disabled={job.state === 'cancelling' || Boolean(cancelling)} onClick={() => void workbench.cancelVoiceover(job.id)}>{t.cancelJob}</PmButton>}
      </div></PmCard>)}
    </div>
  </PmDialog>
}
