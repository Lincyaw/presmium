import type { TeachingDocument } from '@lincyaw/kernel'
import { PmButton, PmField, PmSegmented } from '../components.tsx'
import { useWorkbenchState } from '../context.tsx'
import type { DocumentVoiceScope } from '../document-voices.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { VOICE_MESSAGES } from '../voice-messages.ts'

/** Scope selection uses authored IDs and stays available before runtime compilation. */
export function VoiceScopeField({ document, stepId, value, disabled, onChange }: { document: TeachingDocument, stepId: string, value: DocumentVoiceScope, disabled?: boolean, onChange(value: DocumentVoiceScope): void }) {
  const locale = useWorkbenchState(state => state.locale), t = VOICE_MESSAGES[locale], p = PRODUCTION_MESSAGES[locale]
  const sectionId = document.steps[stepId]?.sectionId
  return <>
    <PmField label={t.scope} group>
      <PmSegmented label={t.scope} value={value.kind} options={(['step', 'steps', 'page', 'document'] as const).map(kind => ({ value: kind, label: p.scopeShort[kind] }))} disabled={disabled} onChange={kind => {
        if (kind === 'document') onChange({ kind })
        else if (kind === 'page' && sectionId) onChange({ kind, sectionId })
        else if (kind === 'step') onChange({ kind, stepId })
        else if (kind === 'steps') onChange({ kind, stepIds: [stepId] })
      }} />
    </PmField>
    {value.kind === 'steps' && <PmField label={t.selectedSteps} group hint={t.selected(value.stepIds.length)} error={value.stepIds.length ? undefined : p.selectSteps}>
      <div className="pmw-voice__steps">
        {document.sectionOrder.flatMap((id, page) => document.sections[id]!.stepOrder.map((selected, index) => {
          const checked = value.stepIds.includes(selected)
          return <PmButton key={selected} small aria-label={`${document.sections[id]!.title} · ${t.step(page + 1, index + 1)}`} aria-pressed={checked} disabled={disabled} onClick={() => onChange({ kind: 'steps', stepIds: checked ? value.stepIds.filter(id => id !== selected) : [...value.stepIds, selected] })}>{page + 1} · {index + 1}</PmButton>
        }))}
      </div>
    </PmField>}
  </>
}
