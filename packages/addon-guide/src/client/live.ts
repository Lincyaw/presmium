import { useViewRole } from '@lincyaw/host'
import type { InjectionKey, Ref } from 'vue'
import { computed, inject } from 'vue'

export type LiveProbe = () => Readonly<Ref<boolean>>

export const LIVE_PROBE: InjectionKey<LiveProbe> = Symbol('presmium.guide.live')

export function useIsLive(): Readonly<Ref<boolean>> {
  const probe = inject(LIVE_PROBE, undefined)
  if (probe) return probe()
  const role = useViewRole()
  return computed(() => role.value === 'audience')
}
