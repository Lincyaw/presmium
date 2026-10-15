import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, ViewRole } from '@presmium/host'
import { stepStateAt } from '@presmium/kernel'
import { useNav, useSlideContext } from '@slidev/client'
import { computed } from 'vue'

/** Slides-form host adapter: cursor and steps come from Slidev's navigation and `$clicks`. */
export function createSlidevHost(): HostAdapter {
  return {
    mode: 'slides',
    useCursor() {
      const { currentSlideNo, clicks } = useNav()
      return computed(() => ({ slide: currentSlideNo.value, step: clicks.value }))
    },
    useStepState(range) {
      // The slide's own clicks, so previews and print pages get their own state.
      const { $clicks } = useSlideContext()
      return computed(() => stepStateAt(range, $clicks.value))
    },
    useViewRole() {
      const { isPresenter } = useNav()
      return computed((): ViewRole => (isPresenter.value ? 'presenter' : 'audience'))
    },
    getService: presmiumService,
    startReport: presmiumReport,
  }
}
