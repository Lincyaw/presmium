import { presmiumReport, presmiumService } from '@lincyaw/host'
import type { HostAdapter, ViewRole } from '@lincyaw/host'
import { isRecord } from '@lincyaw/kernel'
import { configs, useNav, useSlideContext } from '@slidev/client'
import { computed } from 'vue'
import { presmiumConfig } from '../domain/index.ts'
import { sharedStates } from './shared.ts'

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function useFrontmatter(): () => Record<string, unknown> {
  const { currentFrontmatter } = useNav()
  try {
    const { $frontmatter } = useSlideContext()
    if ($frontmatter) return () => record($frontmatter)
  } catch {
  }
  return () => record(currentFrontmatter.value)
}

export function createSlidevHost(): HostAdapter {
  return {
    mode: 'slides',
    lang: configs.htmlAttrs?.lang,
    useCursor() {
      const { currentSlideNo, clicks } = useNav()
      return computed(() => ({ slide: currentSlideNo.value, step: clicks.value }))
    },
    useStep() {
      const { $clicks } = useSlideContext()
      return $clicks
    },
    useViewRole() {
      const { isPresenter } = useNav()
      return computed((): ViewRole => (isPresenter.value ? 'presenter' : 'audience'))
    },
    useStaticRender() {
      return useNav().isPrintMode
    },
    useSectionConfig(pluginId) {
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
