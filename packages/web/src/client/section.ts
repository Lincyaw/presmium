import type { InjectionKey, PropType, Ref } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, readonly, ref, shallowRef } from 'vue'
import { useData } from 'vitepress'
import { FINAL_STEP, slideUrl, STEP_LINE, stepAtLine } from '../domain/index.ts'
import type { SectionLayout, WebOptions } from '../domain/index.ts'
import { trackClicks } from './clicks.ts'

/** What components inside a section learn from the host: its slide and current step. */
export interface SectionContext {
  slide: number
  layout: SectionLayout
  step: Readonly<Ref<number>>
}

export const SECTION: InjectionKey<SectionContext> = Symbol('presmium.web.section')

interface Tracked {
  el: HTMLElement
  context: SectionContext
  step: Ref<number>
}

const sections = new Set<Tracked>()
/** Slide of the section at the reading line, for components outside any section. */
export const activeSlide = ref(1)

let frame = 0

/** Scrolly steps and the active section both follow the reading line of the viewport. */
function update(): void {
  frame = 0
  const line = window.innerHeight * STEP_LINE
  let active: { slide: number, top: number } | undefined
  for (const section of sections) {
    const top = section.el.getBoundingClientRect().top
    if (top <= line && (!active || top > active.top)) active = { slide: section.context.slide, top }
    if (section.context.layout !== 'scrolly') continue
    const blocks = [...section.el.querySelectorAll<HTMLElement>('.pm-step')]
      .map(block => ({ step: Number(block.dataset.step), top: block.getBoundingClientRect().top }))
    section.step.value = stepAtLine(blocks, line)
  }
  activeSlide.value = active?.slide ?? [...sections][0]?.context.slide ?? 1
}

function schedule(): void {
  frame ||= requestAnimationFrame(update)
}

function track(section: Tracked): void {
  if (sections.size === 0) {
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
  }
  sections.add(section)
  schedule()
}

function untrack(section: Tracked): void {
  sections.delete(section)
  if (sections.size > 0) return
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
}

/**
 * One web section, i.e. one slide. Provides the section's steps to the
 * components inside (all reached in a document section, the scrolled-to step in
 * a scrolly one) and links to the same slide in the slides form.
 */
export const PmSection = defineComponent({
  name: 'PmSection',
  props: {
    slide: { type: Number, required: true },
    anchor: { type: String, default: '' },
    layout: { type: String as PropType<SectionLayout>, default: 'document' },
  },
  setup(props, { slots }) {
    const el = shallowRef<HTMLElement>()
    const step = ref(props.layout === 'scrolly' ? 0 : FINAL_STEP)
    const context: SectionContext = { slide: props.slide, layout: props.layout, step: readonly(step) }
    provide(SECTION, context)

    const { theme } = useData()
    const options = computed((): WebOptions => theme.value.presmium?.options ?? {})
    const slidesHref = computed(() => slideUrl(options.value, props.slide, props.layout === 'scrolly' ? step.value : 0))

    let tracked: Tracked | undefined
    let stopClicks: (() => void) | undefined
    onMounted(() => {
      tracked = { el: el.value!, context, step }
      stopClicks = trackClicks(tracked.el, props.layout, context.step)
      track(tracked)
    })
    onBeforeUnmount(() => {
      if (tracked) untrack(tracked)
      stopClicks?.()
    })

    return () => h('section', {
      'ref': el,
      'class': ['pm-section', `pm-section--${props.layout}`],
      'data-slide': props.slide,
      'data-anchor': props.anchor,
      'data-step': props.layout === 'scrolly' ? step.value : undefined,
    }, [
      slots.default?.(),
      slidesHref.value
        ? h('p', { class: 'pm-section__links' }, [h('a', { class: 'pm-open-slides', href: slidesHref.value }, '在幻灯片中打开')])
        : null,
    ])
  },
})
