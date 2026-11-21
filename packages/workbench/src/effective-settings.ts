import { withInheritedSettings } from '@lincyaw/kernel'
import type { DocumentDefaults, EffectiveDocument, PresmiumDocument } from '@lincyaw/kernel'

/**
 * The edited document with what it inherits from its ancestors and the workspace defaults filled in, for decisions
 * (content language, plugins, the document's voice and timing); never saved.
 */
export function effectiveOf(document: PresmiumDocument, inherited?: DocumentDefaults): EffectiveDocument
export function effectiveOf(document: PresmiumDocument | undefined, inherited?: DocumentDefaults): EffectiveDocument | undefined
export function effectiveOf(document: PresmiumDocument | undefined, inherited?: DocumentDefaults): EffectiveDocument | undefined {
  return document && withInheritedSettings(document, inherited)
}
