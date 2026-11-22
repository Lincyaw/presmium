import { useState } from 'react'
import { captionScale, CAPTION_SCALE_MAX, CAPTION_SCALE_MIN } from '@lincyaw/kernel'
import type { PresmiumDocument } from '@lincyaw/kernel'
import { PmButton, PmField, PmRange } from '../components.tsx'
import { useInheritedFrom, useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'

/** The document's caption size in percent steps of ten; a released drag or a key records it once. */
export function ProductionCaptionSize({ identity, document, disabled, onChanged }: { identity: string, document: PresmiumDocument, disabled: boolean, onChanged(): void }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const [preview, setPreview] = useState<number>()
  const percent = Math.round(captionScale(document.production) * 100)
  // `document` has its inherited settings filled in; the source says whether the size is the document's own.
  const own = useWorkbenchState(state => state.authoring?.identity === identity ? state.authoring.content?.production.captions?.scale !== undefined : true)
  const inherits = useWorkbenchState(state => state.authoring?.identity === identity && state.authoring.inherited?.production?.captions?.scale !== undefined)
  const inheritedFrom = useInheritedFrom('production.captions'), tt = useTreeMessages()
  return <PmField label={p.captionSize} group hint={own || !inheritedFrom ? p.captionSizeHint : `${inheritedFrom} · ${p.captionSizeHint}`}>
    <div className="pm-ui-range-row">
      <PmRange label={p.captionSize} value={percent} min={Math.round(CAPTION_SCALE_MIN * 100)} max={Math.round(CAPTION_SCALE_MAX * 100)} step={10} disabled={disabled} valueText={value => `${Math.round(value)}%`}
        onPreviewChange={setPreview} onValueCommit={value => { workbench.production.setCaptionScale(value / 100, identity); onChanged() }} />
      <output>{Math.round(preview ?? percent)}%</output>
      {own && inherits && <PmButton small variant="text" disabled={disabled} onClick={() => { workbench.production.inheritCaptionScale(identity); onChanged() }}>{tt.useInherited}</PmButton>}
    </div>
  </PmField>
}
