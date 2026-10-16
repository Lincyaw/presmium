import { useViewRole } from '@presmium/host'
import type { InjectionKey, Ref } from 'vue'
import { computed, inject } from 'vue'

/**
 * Tells a cue whether it is rendered on the slide the audience is watching.
 * Page-level effects (the driver.js overlay and hint beacons) run only there;
 * the presenter view, previews, print and the page views of the web form show
 * cues inside the slide instead. Called inside the cue's setup.
 */
export type LiveProbe = () => Readonly<Ref<boolean>>

/** Provided by the slides form in `setup/main.ts`, which renders a slide in several places at once. */
export const LIVE_PROBE: InjectionKey<LiveProbe> = Symbol('presmium.guide.live')

/**
 * Must be called inside a component setup. Without a probe (the web form),
 * a cue is live where the host renders it for the audience: the slide of
 * the present view.
 */
export function useIsLive(): Readonly<Ref<boolean>> {
  const probe = inject(LIVE_PROBE, undefined)
  if (probe) return probe()
  const role = useViewRole()
  return computed(() => role.value === 'audience')
}
