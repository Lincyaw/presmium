import { registerPresmiumPlugin } from '@lincyaw/host'
import { useIsSlideActive, useSlideContext } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { computed } from 'vue'
import guidePlugin from '../src/client/plugin.ts'
import { LIVE_PROBE } from '../src/client/live.ts'

export default defineAppSetup(({ app }) => {
  registerPresmiumPlugin(guidePlugin)
  app.provide(LIVE_PROBE, () => {
    const { $renderContext } = useSlideContext()
    const active = useIsSlideActive()
    return computed(() => active.value && $renderContext?.value === 'slide')
  })
})
