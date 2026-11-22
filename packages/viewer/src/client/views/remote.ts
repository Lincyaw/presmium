import type { IRDocument } from '@lincyaw/kernel'

/** The windows' channel of the presentation's captions control, which the presenter view drives (`useAudienceControl`). */
export const captionsControl = (doc: IRDocument) => `presmium.viewer.captions:${doc.meta.title}`

/** The audience's captions control as the presenter view sees it. */
export interface CaptionsControl { on: boolean }

/** Whether any step has narration that the presentation shows as captions. */
export const hasStepNarration = (doc: IRDocument) => doc.sections.some(section => Object.values(section.stepNarrations ?? {}).some(lines => lines.some(line => line.text.trim())))
