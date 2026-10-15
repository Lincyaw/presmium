import type { Router } from 'vitepress'
import { withBase } from 'vitepress'
import type { App } from 'vue'
import { computed, reactive } from 'vue'
import type { FormLink } from '../domain/index.ts'
import { activeSlide } from './section.ts'

/**
 * Slidev's global context in the web form, so slides that read it still render:
 * `$slidev.configs` and `$slidev.themeConfigs` come from the headmatter, and
 * `$nav` follows the section at the reading line and moves between sections.
 * `$page` and `$clicks` belong to one slide; `PmSection` gives them to its content.
 */
export function installSlideContext(app: App, router: Router, deck: Record<string, unknown>, links: readonly FormLink[]): void {
  const go = (slide: number) => {
    const link = links.find(l => l.slide === slide)?.link
    if (link) void router.go(withBase(link))
  }
  const current = computed(() => activeSlide.value)
  const nav = reactive({
    currentPage: current,
    currentSlideNo: current,
    total: links.length,
    go,
    next: () => go(current.value + 1),
    prev: () => go(current.value - 1),
    nextSlide: () => go(current.value + 1),
    prevSlide: () => go(current.value - 1),
  })
  app.config.globalProperties.$nav = nav
  app.config.globalProperties.$slidev = reactive({ configs: deck, themeConfigs: deck.themeConfig ?? {}, nav })
}
