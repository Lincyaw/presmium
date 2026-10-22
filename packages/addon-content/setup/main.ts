import { registerPresmiumPlugin } from '@lincyaw/host'
import { useIsSlideActive, useSlideContext } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { computed } from 'vue'
import { MEDIA_ACTIVE } from '../src/client/media.ts'
import contentPlugin from '../src/client/plugin.ts'

export default defineAppSetup(({ app }) => {
  registerPresmiumPlugin(contentPlugin)
  app.provide(MEDIA_ACTIVE, () => {
    const active = useIsSlideActive()
    const { $renderContext } = useSlideContext()
    // The current presenter slide remains controllable; overview and next-slide
    // previews must not start a second copy of the media.
    return computed(() => active.value && ($renderContext?.value === 'slide' || $renderContext?.value === 'presenter'))
  })
})
