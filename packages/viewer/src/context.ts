import type { IRSection } from '@presmium/kernel'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

/** What a section tells the blocks inside it. */
export interface SectionContext {
  section: Readonly<Ref<IRSection>>
  /** The section's current step; `FINAL_STEP` where every step is shown. */
  step: Readonly<Ref<number>>
  /**
   * The id of the view that renders the section: a page view (`document`,
   * `scrolly`, a plugin's), or an overlay view (`present`, the audience's
   * slide; `presenter`, the presenter window's).
   */
  view: Readonly<Ref<string>>
}

export const SECTION_CONTEXT: InjectionKey<SectionContext> = Symbol('presmium.viewer.section')
/** Set inside a component node: its child blocks are the component's content, and the component owns running and output. */
export const IN_COMPONENT: InjectionKey<boolean> = Symbol('presmium.viewer.inComponent')

/** The enclosing section; undefined outside a section. Must be called inside a component setup or render. */
export function useSectionContext(): SectionContext | undefined {
  return inject(SECTION_CONTEXT, undefined)
}
