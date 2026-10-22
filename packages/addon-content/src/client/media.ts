import { useBlockStepRange, useStepState, useViewRole } from '@lincyaw/host'
import type { InjectionKey, Ref } from 'vue'
import { computed, inject } from 'vue'

export const MEDIA_ACTIVE: InjectionKey<() => Readonly<Ref<boolean>>> = Symbol('presmium.content.mediaActive')

export function useMediaActive(): Readonly<Ref<boolean>> {
  const active = inject(MEDIA_ACTIVE, undefined)?.()
  const state = useStepState(useBlockStepRange())
  const role = useViewRole()
  return computed(() => active?.value !== false && (role.value === 'reader' || state.value.active))
}
