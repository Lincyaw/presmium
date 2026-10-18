import type { IRSection } from '@presmium/kernel'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

export interface SectionContext {
  section: Readonly<Ref<IRSection>>
  step: Readonly<Ref<number>>
  view: Readonly<Ref<string>>
}

export const SECTION_CONTEXT: InjectionKey<SectionContext> = Symbol('presmium.viewer.section')
export const IN_COMPONENT: InjectionKey<boolean> = Symbol('presmium.viewer.inComponent')

export function useSectionContext(): SectionContext | undefined {
  return inject(SECTION_CONTEXT, undefined)
}
