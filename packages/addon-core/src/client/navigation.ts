import type { Navigation } from '@presmium/host'
import { useNav } from '@slidev/client'
import { computed } from 'vue'
import { sectionOf, slideSections } from '../domain/index.ts'
import type { SlideSections } from '../domain/index.ts'

/**
 * The deck's slides and the sections they name (`presmiumId` in each slide's
 * frontmatter, D-4), as Slidev's navigation lists them. Must be called in a
 * component setup (the root setup).
 */
export function useSlideSections(): () => SlideSections {
  const { slides } = useNav()
  const sections = computed(() => slideSections(slides.value.map(route => ({
    no: route.no,
    id: sectionOf((route.meta.slide as { frontmatter?: Record<string, unknown> } | undefined)?.frontmatter),
  }))))
  return () => sections.value
}

/**
 * The `navigation` service of the slides form: the slide and click of this
 * window, through Slidev's navigation, and the slide's section (D-4, F-85).
 * Moving goes to the section of a position by its id; a section this deck
 * does not have (one for another audience) leaves the window where it is. A
 * position without a section, or a deck whose slides name none, moves by the
 * slide's number. Must be called in a component setup (the root setup).
 */
export function createSlidevNavigation(sections = useSlideSections()): Navigation {
  const { currentSlideNo, clicks, currentFrontmatter, go } = useNav()
  return {
    position: computed(() => {
      const section = sectionOf(currentFrontmatter.value)
      return { slide: currentSlideNo.value, step: clicks.value, ...section ? { section } : {} }
    }),
    go({ slide, step, section }) {
      const own = sections()
      if (section === undefined || !own.named) return void go(slide, step)
      const target = own.noOf(section)
      if (target !== undefined) void go(target, step)
    },
  }
}
