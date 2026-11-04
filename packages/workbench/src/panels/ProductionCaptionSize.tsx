import { useState } from 'react'
import { captionScale, CAPTION_SCALE_MAX, CAPTION_SCALE_MIN } from '@lincyaw/kernel'
import type { TeachingDocument } from '@lincyaw/kernel'
import { PmField, PmRange } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'

/** The document's caption size in percent steps of ten; a released drag or a key records it once. */
export function ProductionCaptionSize({ identity, document, disabled, onChanged }: { identity: string, document: TeachingDocument, disabled: boolean, onChanged(): void }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const [preview, setPreview] = useState<number>()
  const percent = Math.round(captionScale(document.production) * 100)
  return <PmField label={p.captionSize} group hint={p.captionSizeHint}>
    <div className="pm-ui-range-row">
      <PmRange label={p.captionSize} value={percent} min={Math.round(CAPTION_SCALE_MIN * 100)} max={Math.round(CAPTION_SCALE_MAX * 100)} step={10} disabled={disabled} valueText={value => `${Math.round(value)}%`}
        onPreviewChange={setPreview} onValueCommit={value => { workbench.setDocumentCaptionScale(value / 100, identity); onChanged() }} />
      <output>{Math.round(preview ?? percent)}%</output>
    </div>
  </PmField>
}
