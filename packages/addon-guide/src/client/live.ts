import type { InjectionKey, Ref } from 'vue'
import { inject, ref } from 'vue'

/**
 * Tells a cue whether it is rendered on the slide the audience is watching.
 * Page-level effects (the driver.js overlay and hint beacons) run only there;
 * the presenter view, previews, print and the document form show cues inside
 * the slide instead. Called inside the cue's setup.
 */
export type LiveProbe = () => Readonly<Ref<boolean>>

/** Provided by the slides form in `setup/main.ts`; the document form leaves it out. */
export const LIVE_PROBE: InjectionKey<LiveProbe> = Symbol('presmium.guide.live')

/** Must be called inside a component setup. False when the host provides no probe. */
export function useIsLive(): Readonly<Ref<boolean>> {
  return inject(LIVE_PROBE, undefined)?.() ?? ref(false)
}
