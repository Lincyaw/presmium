import type { Navigation } from '@presmium/host'
import { useNav } from '@slidev/client'
import { computed } from 'vue'

/**
 * The `navigation` service of the slides form: the slide and click of this
 * window, through Slidev's navigation. Must be called in a component setup
 * (the root setup).
 */
export function createSlidevNavigation(): Navigation {
  const { currentSlideNo, clicks, go } = useNav()
  return {
    position: computed(() => ({ slide: currentSlideNo.value, step: clicks.value })),
    go: ({ slide, step }) => void go(slide, step),
  }
}
