import { useIsSlideActive, useSlideContext } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { computed } from 'vue'
import { LIVE_PROBE } from '../src/client/live.ts'

// A cue is live on the current slide of the play view ('slide' render context).
// The presenter view, its next-step preview, the overview and print show cues in place.
export default defineAppSetup(({ app }) => {
  app.provide(LIVE_PROBE, () => {
    const { $renderContext } = useSlideContext()
    const active = useIsSlideActive()
    return computed(() => active.value && $renderContext?.value === 'slide')
  })
})
