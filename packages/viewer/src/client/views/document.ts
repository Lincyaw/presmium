import type { IRSection } from '@lincyaw/kernel'
import type { PropType } from 'vue'
import { defineComponent, h } from 'vue'
import { SectionView } from '../section.ts'
import type { SectionLayout } from '../section.ts'
import { useViewer } from '../viewer-state.ts'

export const DocumentView = defineComponent({
  name: 'PmDocumentView',
  props: { sections: { type: Array as PropType<IRSection[]>, required: true } },
  setup(props) {
    const viewer = useViewer()
    const layout = (section: IRSection): SectionLayout => (section.hints[viewer.options.renderer]?.layout === 'scrolly' ? 'scrolly' : 'document')
    return () => h('div', { class: 'pm-view pm-view--document' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: layout(section) })))
  },
})
