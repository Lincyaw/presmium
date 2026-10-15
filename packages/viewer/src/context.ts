import type { IRBlock, IRSection } from '@presmium/kernel'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

/** What a section tells the blocks inside it. */
export interface SectionContext {
  section: Readonly<Ref<IRSection>>
  /** The section's current step; `FINAL_STEP` where every step is shown. */
  step: Readonly<Ref<number>>
}

/** What a block tells the plugin components inside it. */
export interface BlockContext extends SectionContext {
  block: Readonly<Ref<IRBlock>>
  /**
   * The block's own step: the section step minus the block's `at`, so a
   * component's state k shows at step `at + k` (docs/ir.md section 2.4).
   */
  local: Readonly<Ref<number>>
}

export const SECTION_CONTEXT: InjectionKey<SectionContext> = Symbol('presmium.viewer.section')
export const BLOCK_CONTEXT: InjectionKey<BlockContext> = Symbol('presmium.viewer.block')
/** Set inside a component node: its child blocks are the component's content, and the component owns running and output. */
export const IN_COMPONENT: InjectionKey<boolean> = Symbol('presmium.viewer.inComponent')

/** The enclosing section; undefined outside a section. Must be called inside a component setup or render. */
export function useSectionContext(): SectionContext | undefined {
  return inject(SECTION_CONTEXT, undefined)
}

/** The enclosing block; undefined outside a block. Must be called inside a component setup or render. */
export function useBlockContext(): BlockContext | undefined {
  return inject(BLOCK_CONTEXT, undefined)
}
