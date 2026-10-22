import type { Navigation, NavigationPosition } from '@lincyaw/host'
import type { FollowAnchor } from '@lincyaw/kernel'
import { useNav } from '@slidev/client'
import { computed } from 'vue'
import { slideSections, toSlideSection } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'

export function useSlideSections(): () => SlideSections {
  const { slides } = useNav()
  const sections = computed(() => slideSections(slides.value.map(route => ({
    no: route.no,
    ...toSlideSection((route.meta.slide as { frontmatter?: Record<string, unknown> } | undefined)?.frontmatter),
  }))))
  return () => sections.value
}

export function createSlidevNavigation(sections = useSlideSections()): Navigation {
  const { currentSlideNo, clicks, go } = useNav()
  return {
    position: computed((): NavigationPosition & FollowAnchor => ({
      slide: currentSlideNo.value,
      step: clicks.value,
      ...sections().anchorOf(currentSlideNo.value, clicks.value),
    })),
    go(position: NavigationPosition & FollowAnchor) {
      const own = sections()
      if (position.section === undefined || !own.named) return void go(position.slide, position.step)
      const place = own.slideAt(position)
      if (place) void go(place.no, place.step)
    },
  }
}
