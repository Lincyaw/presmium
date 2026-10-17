import type { Navigation, NavigationPosition } from '@presmium/host'
import type { FollowAnchor } from '@presmium/viewer/domain'
import { useNav } from '@slidev/client'
import { computed } from 'vue'
import { slideSectionOf, slideSections } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'

/**
 * The deck's slides and their sections (`presmiumId`, `presmiumSteps` and
 * `presmiumBack` in each slide's frontmatter, D-4), as Slidev's navigation
 * lists them. Must be called in a component setup (the root setup).
 */
export function useSlideSections(): () => SlideSections {
  const { slides } = useNav()
  const sections = computed(() => slideSections(slides.value.map(route => ({
    no: route.no,
    ...slideSectionOf((route.meta.slide as { frontmatter?: Record<string, unknown> } | undefined)?.frontmatter),
  }))))
  return () => sections.value
}

/**
 * The `navigation` service of the slides form: the slide and click of this
 * window, through Slidev's navigation, and the position by ids (D-4, F-85):
 * the slide's section, the keys of the clicks reached on it, and for a
 * section only some audiences have, the section to go back to
 * (`FollowAnchor`). Moving goes by ids where the position has a section id
 * (`SlideSections.placeOf`): the full and the student build number their
 * slides and clicks apart; where this deck has neither that section nor the
 * one to go back to, the window stays. A position without a section, or a
 * deck whose slides name none, moves by the numbers. Must be called in a
 * component setup (the root setup).
 */
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
      const place = own.placeOf(position)
      if (place) void go(place.no, place.step)
    },
  }
}
