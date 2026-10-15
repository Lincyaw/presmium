import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import { computed, defineComponent, inject, provide, ref, toValue } from 'vue'

/**
 * Step scope (docs/ir.md section 2.4): the step at which a block appears.
 * The renderers give each component block its `at`; a component counts its
 * internal steps from there, so its state k shows at step `at + k` wherever
 * the block appears in its section.
 */
const STEP_SCOPE: InjectionKey<Readonly<Ref<number>>> = Symbol('presmium.stepScope')

const NO_SCOPE = ref(0)

/** Makes `at` the step scope of the components below. Must be called inside a component setup. */
export function provideStepScope(at: MaybeRefOrGetter<number>): void {
  provide(STEP_SCOPE, computed(() => toValue(at)))
}

export interface StepScope {
  /** Step of the slide or section at which the block's internal step 0 shows; 0 outside a block. */
  readonly at: Readonly<Ref<number>>
  /**
   * The slide or section step of internal step `k`, for registering it with
   * the host, e.g. `v-click="scope.step(k)"` for every k from 1 to the block's span.
   */
  step(k: number): number
}

/** The enclosing step scope. Must be called inside a component setup. */
export function useStepScope(): StepScope {
  const at = inject(STEP_SCOPE, NO_SCOPE)
  return { at, step: k => at.value + k }
}

/** `<PmStepScope :at="n">`: the step scope of its content, for renderers that write component tags (the slides form). */
export const PmStepScope = defineComponent({
  name: 'PmStepScope',
  props: { at: { type: Number, default: 0 } },
  setup(props, { slots }) {
    provideStepScope(() => props.at)
    return () => slots.default?.()
  },
})
