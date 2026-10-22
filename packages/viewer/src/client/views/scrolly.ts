import type { IRSection } from '@lincyaw/kernel'
import type { PropType } from 'vue'
import { defineComponent, h } from 'vue'
import { SectionView } from '../section.ts'

export const ScrollyView = defineComponent({
  name: 'PmScrollyView',
  props: { sections: { type: Array as PropType<IRSection[]>, required: true } },
  setup(props) {
    return () => h('div', { class: 'pm-view pm-view--scrolly' }, props.sections.map(section => h(SectionView, { key: section.id, section, layout: 'scrolly' })))
  },
})
