import type { StepRange } from '@lincyaw/kernel/contracts'
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import { computed, defineComponent, inject, provide, ref, toValue } from 'vue'

const STEP_SCOPE: InjectionKey<Readonly<Ref<number>>> = Symbol('presmium.stepScope')
const BLOCK_STEP_RANGE: InjectionKey<Readonly<Ref<StepRange>>> = Symbol('presmium.blockStepRange')

const NO_SCOPE = ref(0)

export function provideStepScope(at: MaybeRefOrGetter<number>, until?: MaybeRefOrGetter<number | undefined>): void {
  const parent = inject(BLOCK_STEP_RANGE, undefined)
  const start = computed(() => toValue(at))
  provide(STEP_SCOPE, start)
  provide(BLOCK_STEP_RANGE, computed(() => {
    const end = toValue(until)
    const parentEnd = parent?.value.to
    return {
      from: Math.max(start.value, parent?.value.from ?? start.value),
      to: end === undefined ? parentEnd : parentEnd === undefined ? end : Math.min(end, parentEnd),
    }
  }))
}

export interface StepScope {
  readonly at: Readonly<Ref<number>>
  step(k: number): number
}

export function useStepScope(): StepScope {
  const at = inject(STEP_SCOPE, NO_SCOPE)
  return { at, step: k => at.value + k }
}

/** The owning block's [from, to) range, relative to the existing step scope. */
export function useBlockStepRange(): StepRange {
  const { at } = useStepScope()
  const range = inject(BLOCK_STEP_RANGE, undefined)
  return {
    get from() { return (range?.value.from ?? at.value) - at.value },
    get to() {
      const end = range?.value.to
      return end === undefined ? undefined : end - at.value
    },
  }
}

export const PmStepScope = defineComponent({
  name: 'PmStepScope',
  props: { at: { type: Number, default: 0 }, until: Number },
  setup(props, { slots }) {
    provideStepScope(() => props.at, () => props.until)
    return () => slots.default?.()
  },
})
