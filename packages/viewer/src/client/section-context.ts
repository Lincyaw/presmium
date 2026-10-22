import type { IRSection } from '@lincyaw/kernel'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

export interface SectionContext {
  section: Readonly<Ref<IRSection>>
  step: Readonly<Ref<number>>
  view: Readonly<Ref<string>>
}

export const SECTION_CONTEXT: InjectionKey<SectionContext> = Symbol('presmium.viewer.section')

export function useSectionContext(): SectionContext | undefined {
  return inject(SECTION_CONTEXT, undefined)
}
