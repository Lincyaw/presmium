/**
 * Example viewer plugin (K-20, docs/ir.md section 8.2): a view that shows the
 * sections of a page as cards, a renderer for `csv` code blocks and one for
 * the component PmSwap.
 */
import type { CodeNode, IRBlock, IRSection } from '@lincyaw/kernel'
import type { ViewerPlugin } from '@lincyaw/viewer'
import type { PropType } from 'vue'
import { defineComponent, h } from 'vue'

const nodeProps = {
  block: { type: Object as PropType<IRBlock>, required: true },
  section: { type: Object as PropType<IRSection>, required: true },
  step: { type: Number, required: true },
  expanded: Boolean,
} as const

const plugin: ViewerPlugin = ({ registerView, registerNodeRenderer, useViewer }) => {
  registerView({
    id: 'cards',
    label: '卡片',
    kind: 'page',
    component: defineComponent({
      props: { sections: { type: Array as PropType<IRSection[]>, required: true } },
      setup(props) {
        const viewer = useViewer()
        return () => h('div', { class: 'pm-view pm-cards' }, props.sections.map(section => h('article', {
          'key': section.id,
          'class': 'pm-card',
          'data-section': section.id,
          'aria-current': viewer.position.value.section === section.id ? 'true' : undefined,
        }, [h('h2', section.title), h('p', `${section.blocks.length} 块，${section.steps} 步`)])))
      },
    }),
  })

  registerNodeRenderer('code:csv', defineComponent({
    props: nodeProps,
    setup(props) {
      return () => {
        const rows = (props.block.node as CodeNode).value.trim().split('\n').map(line => line.split(','))
        return h('table', { class: 'pm-csv' }, h('tbody', rows.map(row => h('tr', row.map(cell => h('td', cell))))))
      }
    },
  }))

  registerNodeRenderer('PmSwap', defineComponent({
    props: nodeProps,
    setup: () => () => h('p', { class: 'pm-swapped' }, '插件的渲染器'),
  }))
}

export default plugin
