import { isChapterTitle, narrationAt } from '@lincyaw/kernel'
import type { IRBlock, IRSection } from '@lincyaw/kernel'
import type { PropType, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, toRef } from 'vue'
import { FINAL_STEP, sectionDiagnostics } from '../domain/index.ts'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './section-context.ts'
import { viewerMessages } from './viewer-messages.ts'
import { useViewer } from './viewer-state.ts'
import { PAGE_TRACKER } from './views/page-tracker.ts'

export type SectionLayout = 'document' | 'scrolly'

function blockViews(blocks: IRBlock[], section: IRSection, step: number, expanded: boolean): VNodeChild[] {
  return blocks.map(block => h(BlockView, { key: block.id, block, section, step, expanded }))
}

export const SectionView = defineComponent({
  name: 'PmSectionView',
  props: {
    section: { type: Object as PropType<IRSection>, required: true },
    layout: { type: String as PropType<SectionLayout>, default: 'document' },
  },
  setup(props) {
    const viewer = useViewer()
    const tracker = inject(PAGE_TRACKER, undefined)
    const el = shallowRef<HTMLElement>()
    const scrolled = ref(0)
    const step = computed(() => (props.layout === 'scrolly' ? scrolled.value : FINAL_STEP))
    provide(SECTION_CONTEXT, { section: toRef(props, 'section'), step, view: viewer.pageView })

    let untrack: (() => void) | undefined
    onMounted(() => {
      if (!el.value || !tracker) return
      untrack = tracker.add({ el: el.value, id: () => props.section.id, layout: () => props.layout, step: scrolled })
    })
    onBeforeUnmount(() => untrack?.())

    const heading = computed(() => (isChapterTitle(viewer.doc.value, props.section) ? 'h1' : 'h2'))

    return () => {
      const { section, layout } = props
      const t = viewerMessages().section
      const current = step.value
      const problems = viewer.options.diagnostics ? sectionDiagnostics(section, viewer.doc.value.diagnostics) : []
      const body = layout === 'scrolly' && section.blocks.some(b => b.role === 'visual')
        ? [
            h('div', { class: 'pm-stage pm-board' }, blockViews(section.blocks.filter(b => b.role === 'visual'), section, current, false)),
            h('div', { class: 'pm-track' }, Array.from({ length: section.steps + 1 }, (_, k) => {
              const narration = narrationAt(section, k)
              return h('div', { 'key': k, 'class': ['pm-step', { 'pm-step--current': k === current, 'pm-step--bare': narration.length === 0 }], 'data-step': k }, blockViews(narration, section, current, false))
            })),
          ]
        : [h('div', { class: 'pm-section__body' }, blockViews(section.blocks, section, current, true))]
      return h('section', {
        'ref': el,
        'class': ['pm-section', `pm-section--${layout}`, { 'pm-section--error': problems.some(p => p.severity === 'error') }],
        'data-section': section.id,
        'data-index': section.index,
        'data-step': layout === 'scrolly' ? current : undefined,
      }, [
        h(heading.value, { id: section.id, class: 'pm-section__title', tabindex: -1 }, [
          section.title,
          viewer.options.sectionHeading?.(section, current) ?? null,
          h('a', { 'class': 'header-anchor', 'href': `#${section.id}`, 'aria-label': t.anchor(section.title) }, '​'),
        ]),
        viewer.options.openSource
          ? h('p', { class: 'pm-section__source' }, h('button', {
              type: 'button',
              title: t.sourceTitle(`${section.source.file}:${section.source.line}`),
              onClick: () => viewer.options.openSource!(section.source),
            }, t.openSource))
          : null,
        problems.length
          ? h('ul', { class: 'pm-diagnostics', role: 'alert' }, problems.map((p, i) => h('li', { 'key': i, 'data-severity': p.severity }, `${p.severity}: ${p.message}`)))
          : null,
        ...body,
      ])
    }
  },
})
