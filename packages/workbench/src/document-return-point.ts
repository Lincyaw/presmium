import type { TeachingDocument } from '@lincyaw/kernel'

export interface DocumentReturnPoint {
  sectionId: string
  stepId?: string
  offset?: number
}

/** A browser return address, never document content or an instruction to open another document. */
export class DocumentReturnPoints {
  readonly #memory = new Map<string, DocumentReturnPoint>()

  read(identity: string): DocumentReturnPoint | undefined {
    const cached = this.#memory.get(identity)
    if (cached) return cached
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(`presmium.document-position.v1:${identity}`) ?? 'null')
      if (!value || typeof value !== 'object' || !('sectionId' in value) || typeof value.sectionId !== 'string') return
      const stepId = 'stepId' in value ? value.stepId : undefined, offset = 'offset' in value ? value.offset : undefined
      if (stepId !== undefined && typeof stepId !== 'string' || offset !== undefined && (typeof offset !== 'number' || !Number.isFinite(offset))) return
      const point: DocumentReturnPoint = { sectionId: value.sectionId,
        ...stepId !== undefined ? { stepId } : {}, ...offset !== undefined ? { offset } : {} }
      this.#memory.set(identity, point)
      return point
    } catch { return }
  }

  write(identity: string, point: DocumentReturnPoint): void {
    const previous = this.#memory.get(identity)
    if (previous?.sectionId === point.sectionId && previous.stepId === point.stepId && previous.offset === point.offset) return
    this.#memory.set(identity, point)
    try { sessionStorage.setItem(`presmium.document-position.v1:${identity}`, JSON.stringify(point)) } catch { /* Editing does not depend on position storage. */ }
  }

  forget(identity: string): void {
    this.#memory.delete(identity)
    try { sessionStorage.removeItem(`presmium.document-position.v1:${identity}`) } catch { /* Editing remains available. */ }
  }
}

export function documentReturnStep(document: TeachingDocument, point: DocumentReturnPoint): number | undefined {
  const section = document.sections[point.sectionId]
  if (!section || !document.sectionOrder.includes(point.sectionId)) return
  if (point.stepId === undefined) return section.stepOrder.length === 0 ? 0 : undefined
  const index = section.stepOrder.indexOf(point.stepId)
  return index >= 0 && document.steps[point.stepId]?.sectionId === point.sectionId ? index : undefined
}

export function documentViewportOffset(element: HTMLElement, sectionId: string): number | undefined {
  if (!element.clientHeight) return
  const heading = element.querySelector<HTMLElement>(`[data-document-section="${CSS.escape(sectionId)}"]`)
  return heading ? element.getBoundingClientRect().top - heading.getBoundingClientRect().top : undefined
}

export function restoreDocumentViewport(element: HTMLElement, point: DocumentReturnPoint): void {
  if (!element.clientHeight) return
  const heading = element.querySelector<HTMLElement>(`[data-document-section="${CSS.escape(point.sectionId)}"]`)
  if (heading) element.scrollTop += heading.getBoundingClientRect().top - element.getBoundingClientRect().top + (point.offset ?? 0)
}
