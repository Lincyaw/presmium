import type { Navigation } from '@presmium/host'
import { useNav } from '@slidev/client'
import { computed } from 'vue'

/**
 * The frontmatter key that names a slide's section (D-4): the slides renderer
 * writes each section's id there; the full and the student build number
 * their slides apart, the ids are the same.
 */
const SECTION_KEY = 'presmiumId'

function sectionOf(frontmatter: Record<string, unknown> | undefined): string | undefined {
  const id = frontmatter?.[SECTION_KEY]
  return typeof id === 'string' && id ? id : undefined
}

/**
 * The `navigation` service of the slides form: the slide and click of this
 * window, through Slidev's navigation, and the slide's section (D-4, F-85).
 * Moving goes to the section of a position by its id; a section this deck
 * does not have (one for another audience) leaves the window where it is. A
 * position without a section, or a deck whose slides name none, moves by the
 * slide's number. Must be called in a component setup (the root setup).
 */
export function createSlidevNavigation(): Navigation {
  const { currentSlideNo, clicks, currentFrontmatter, go, slides } = useNav()
  return {
    position: computed(() => {
      const section = sectionOf(currentFrontmatter.value)
      return { slide: currentSlideNo.value, step: clicks.value, ...section ? { section } : {} }
    }),
    go({ slide, step, section }) {
      const named = section === undefined || !slides.value.some(route => sectionOf(route.meta.slide.frontmatter)) ? undefined : section
      if (named === undefined) return void go(slide, step)
      const target = slides.value.find(route => sectionOf(route.meta.slide.frontmatter) === named)
      if (target) void go(target.no, step)
    },
  }
}
