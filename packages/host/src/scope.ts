import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import { computed, defineComponent, inject, provide, ref, toValue } from 'vue'

const STEP_SCOPE: InjectionKey<Readonly<Ref<number>>> = Symbol('presmium.stepScope')

const NO_SCOPE = ref(0)

export function provideStepScope(at: MaybeRefOrGetter<number>): void {
  provide(STEP_SCOPE, computed(() => toValue(at)))
}

export interface StepScope {
  readonly at: Readonly<Ref<number>>
  step(k: number): number
}

export function useStepScope(): StepScope {
  const at = inject(STEP_SCOPE, NO_SCOPE)
  return { at, step: k => at.value + k }
}

export const PmStepScope = defineComponent({
  name: 'PmStepScope',
  props: { at: { type: Number, default: 0 } },
  setup(props, { slots }) {
    provideStepScope(() => props.at)
    return () => slots.default?.()
  },
})
