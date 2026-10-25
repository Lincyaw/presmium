import type { IRDocument, VoiceScope, VoiceSettingsAnswer, VoiceTarget } from '@lincyaw/kernel'
import { PmButton, PmField, PmSegmented } from '../components.tsx'
import { useWorkbenchState } from '../context.tsx'
import { VOICE_MESSAGES } from '../voice-messages.ts'

export function voiceScopeContains(scope: VoiceScope, target: VoiceTarget): boolean {
  if (scope.kind === 'document') return true
  if (scope.kind === 'page') return scope.section === target.section
  return (scope.kind === 'step' ? [scope.target] : scope.targets).some(item => item.section === target.section && item.step === target.step && item.binding === target.binding)
}

/** Uses the snapshot's complete, bound step identities instead of deriving filtered preview indices. */
export function VoiceScopeField({ settings, doc, target, value, disabled, allowUneditableSteps = false, onChange }: { settings: VoiceSettingsAnswer, doc: IRDocument, target: VoiceTarget, value: VoiceScope, disabled?: boolean, allowUneditableSteps?: boolean, onChange(value: VoiceScope): void }) {
  const t = VOICE_MESSAGES[useWorkbenchState(state => state.locale)]
  const selected = settings.steps.find(item => item.target.section === target.section && item.target.step === target.step)
  const scopes = (['step', 'steps', 'page', 'document'] as const).map(kind => ({ value: kind, label: t.scopes[kind], disabled: kind === 'step' && !allowUneditableSteps && !selected?.editable }))
  return <>
    <PmField label={t.scope} group>
      <PmSegmented label={t.scope} value={value.kind} options={scopes} disabled={disabled} onChange={kind => {
        if (kind === 'document') onChange({ kind })
        else if (kind === 'page') onChange({ kind, section: target.section })
        else if (kind === 'step') onChange({ kind, target })
        else onChange({ kind: 'steps', targets: allowUneditableSteps || selected?.editable ? [target] : [] })
      }} />
    </PmField>
    {value.kind === 'steps' && <PmField label={t.selectedSteps} group hint={t.selected(value.targets.length)}>
      <div className="pmw-voice__steps">
        {settings.steps.map(item => {
          const page = doc.sections.findIndex(page => page.id === item.target.section) + 1
          const checked = voiceScopeContains(value, item.target)
          return <PmButton key={JSON.stringify(item.target)} small aria-label={t.step(page, item.target.step + 1)} aria-pressed={checked} disabled={disabled || !allowUneditableSteps && !item.editable} onClick={() => onChange({ kind: 'steps', targets: checked ? value.targets.filter(at => at.section !== item.target.section || at.step !== item.target.step) : [...value.targets, item.target] })}>{page} · {item.target.step + 1}</PmButton>
        })}
      </div>
    </PmField>}
  </>
}
