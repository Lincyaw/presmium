import { registerPresmiumPlugin } from '@presmium/host'
import { useIsSlideActive, useSlideContext } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { computed } from 'vue'
import guidePlugin from '../src/client/plugin.ts'
import { LIVE_PROBE } from '../src/client/live.ts'

// A cue is live on the current slide of the play view ('slide' render context).
// The presenter view, its next-step preview, the overview and print show cues in place.
// The kernel plugin replays the spotlights and hints of a lecture (`spot`, `hint`).
export default defineAppSetup(({ app }) => {
  registerPresmiumPlugin(guidePlugin)
  app.provide(LIVE_PROBE, () => {
    const { $renderContext } = useSlideContext()
    const active = useIsSlideActive()
    return computed(() => active.value && $renderContext?.value === 'slide')
  })
})
