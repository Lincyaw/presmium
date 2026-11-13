import type { Production } from './contracts/document.ts'

/** Caption visibility inherits independently of voice choice and timing. */
export function stepCaptionsVisible(production: Production | undefined, sectionId: string, stepId?: string): boolean {
  return (stepId ? production?.stepOverrides[stepId]?.captionVisible : undefined)
    ?? production?.sectionOverrides?.[sectionId]?.captionVisible
    ?? production?.defaults.captionVisible
    ?? true
}
