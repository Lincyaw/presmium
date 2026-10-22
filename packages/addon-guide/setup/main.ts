import { registerPresmiumPlugin } from '@lincyaw/host'
import { useIsSlideActive, useSlideContext } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { computed } from 'vue'
import guidePlugin from '../src/client/plugin.ts'
import { STAGE_PROBE } from '../src/client/stage.ts'

export default defineAppSetup(({ app }) => {
  registerPresmiumPlugin(guidePlugin)
  app.provide(STAGE_PROBE, () => {
    const { $renderContext } = useSlideContext()
    const active = useIsSlideActive()
    return computed(() => active.value && $renderContext?.value === 'slide')
  })
})
