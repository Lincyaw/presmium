import type { IRSection } from '@lincyaw/kernel'
import type { App, Component, ComponentOptions } from 'vue'
import { computed, getCurrentInstance, inject, reactive } from 'vue'
import { SECTION_CONTEXT } from './context.ts'
import type { SectionContext } from './context.ts'
import { VIEWER } from './viewer.ts'
import type { Viewer } from './viewer.ts'

function section() {
  return getCurrentInstance() ? inject(SECTION_CONTEXT, undefined) : undefined
}

export function installSlideGlobals(app: App, viewer: Viewer): void {
  const props = app.config.globalProperties as Record<string, unknown>
  const index = computed(() => viewer.section(viewer.position.value.section)?.index ?? 1)
  const go = (n: number) => {
    const target = viewer.doc.value.sections[n - 1]
    if (target) viewer.show({ section: target.id, step: 0 })
  }
  const nav = reactive({
    currentPage: index,
    currentSlideNo: index,
    clicks: computed(() => viewer.position.value.step),
    total: computed(() => viewer.doc.value.sections.length),
    go,
    next: () => viewer.next(),
    prev: () => viewer.prev(),
    nextSlide: () => go(index.value + 1),
    prevSlide: () => go(index.value - 1),
  })
  const configs = computed(() => ({ ...viewer.doc.value.meta, presmium: viewer.doc.value.config.presmium }))
  const define = (name: string, get: () => unknown) => {
    const existing = Object.getOwnPropertyDescriptor(props, name)
    if (existing && !existing.configurable) return
    Object.defineProperty(props, name, { configurable: true, enumerable: true, get })
  }
  define('$page', () => section()?.section.value.index ?? index.value)
  define('$clicks', () => section()?.step.value ?? viewer.position.value.step)
  define('$nav', () => nav)
  define('$slidev', () => ({ configs: configs.value, themeConfigs: {}, nav }))
}

export function sectionFrontmatter(section: IRSection, renderer: string): Record<string, unknown> {
  return { title: section.title, ...section.hints[renderer] }
}

export function withSlideGlobals(component: Component): Component {
  if (typeof component === 'function') return component
  const options = component as ComponentOptions
  const inject = Array.isArray(options.inject) ? Object.fromEntries(options.inject.map(key => [key, key])) : options.inject
  return {
    ...options,
    inject: {
      ...inject,
      pmSection: { from: SECTION_CONTEXT, default: undefined },
      pmViewer: { from: VIEWER, default: undefined },
    },
    computed: {
      ...options.computed,
      $frontmatter(): Record<string, unknown> | undefined {
        const { pmSection, pmViewer } = this as unknown as { pmSection?: SectionContext, pmViewer?: Viewer }
        return pmSection && sectionFrontmatter(pmSection.section.value, pmViewer?.options.renderer ?? 'web')
      },
    },
  } as ComponentOptions
}
