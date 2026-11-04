import { CAPTION_SCALE_MAX, CAPTION_SCALE_MIN } from './contracts/document.ts'
import type { Production, TeachingDocument } from './contracts/document.ts'

/** The caption size a document sets (`production.captions.scale`); 1 when it sets none or one out of range. */
export function captionScale(production: Pick<Production, 'captions'> | undefined): number {
  const scale = production?.captions?.scale
  return typeof scale === 'number' && scale >= CAPTION_SCALE_MIN && scale <= CAPTION_SCALE_MAX ? scale : 1
}

/** Sets the caption size, kept in range and rounded to a tenth; the default size 1 removes the setting. */
export function changeDocumentCaptionScale(document: TeachingDocument, scale: number): TeachingDocument {
  if (!Number.isFinite(scale)) throw new Error('document-caption-scale')
  const value = Math.round(Math.min(CAPTION_SCALE_MAX, Math.max(CAPTION_SCALE_MIN, scale)) * 10) / 10
  if (value === captionScale(document.production)) return document
  const { captions: _captions, ...production } = document.production
  return { ...document, production: value === 1 ? production : { ...production, captions: { scale: value } } }
}
