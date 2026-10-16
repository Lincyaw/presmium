import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, ViewRole } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
import { configs, useNav, useSlideContext } from '@slidev/client'
import { computed } from 'vue'
import { presmiumConfig } from '../domain/index.ts'
import { sharedStates } from './shared.ts'

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** The frontmatter of the slide that renders the caller; the current slide's outside slides (global layers). */
function useFrontmatter(): () => Record<string, unknown> {
  const { currentFrontmatter } = useNav()
  try {
    const { $frontmatter } = useSlideContext()
    if ($frontmatter) return () => record($frontmatter)
  } catch {
    // Not inside a slide.
  }
  return () => record(currentFrontmatter.value)
}

/** Slides-form host adapter: cursor and steps come from Slidev's navigation and `$clicks`. */
export function createSlidevHost(): HostAdapter {
  return {
    mode: 'slides',
    // The deck's language, which the slides renderer writes to the headmatter `htmlAttrs`.
    lang: configs.htmlAttrs?.lang,
    useCursor() {
      const { currentSlideNo, clicks } = useNav()
      return computed(() => ({ slide: currentSlideNo.value, step: clicks.value }))
    },
    useStep() {
      // The slide's own clicks, so previews and print pages get their own state.
      const { $clicks } = useSlideContext()
      return $clicks
    },
    useViewRole() {
      const { isPresenter } = useNav()
      return computed((): ViewRole => (isPresenter.value ? 'presenter' : 'audience'))
    },
    useStaticRender() {
      // PDF and PNG exports render every slide in print mode.
      return useNav().isPrintMode
    },
    useSectionConfig(pluginId) {
      // The slides renderer writes a section's `{config}` to its slide's frontmatter `presmium`;
      // the cover's frontmatter is the headmatter, whose `presmium` is the global configuration,
      // so the cover's own goes to `presmiumSection`.
      const frontmatter = useFrontmatter()
      return computed(() => {
        const slide = frontmatter()
        return {
          ...record(presmiumConfig(configs)[pluginId]),
          ...record(record(slide.presmium)[pluginId]),
          ...record(record(slide.presmiumSection)[pluginId]),
        }
      })
    },
    useSharedState: sharedStates.sharedState,
    getService: presmiumService,
    startReport: presmiumReport,
  }
}
