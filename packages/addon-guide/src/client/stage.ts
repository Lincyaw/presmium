import { useViewRole } from '@lincyaw/host'
import type { InjectionKey, Ref } from 'vue'
import { computed, inject } from 'vue'

export type StageProbe = () => Readonly<Ref<boolean>>

export const STAGE_PROBE: InjectionKey<StageProbe> = Symbol('presmium.guide.stage')

export function useIsOnStage(): Readonly<Ref<boolean>> {
  const probe = inject(STAGE_PROBE, undefined)
  if (probe) return probe()
  const role = useViewRole()
  return computed(() => role.value === 'audience')
}
