import { PmBoundary } from '@presmium/host'
import type { ComponentNode, IRBlock, IRSection } from '@presmium/kernel'
import type { PropType, VNode } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, shallowRef, toRef } from 'vue'
import { BLOCK_CLASS, trackClicks } from './clicks.ts'
import { CodeBlockView } from './code.ts'
import { BLOCK_CONTEXT } from './context.ts'
import { blockVisible, FINAL_STEP } from './domain/index.ts'
import { hastToVNodes, markdownToHast, MarkdownView } from './markdown.ts'
import { getComponent, getNodeRenderer } from './registry.ts'

const blockProps = {
  block: { type: Object as PropType<IRBlock>, required: true },
  section: { type: Object as PropType<IRSection>, required: true },
  /** The section's step; `FINAL_STEP` shows the final state. */
  step: { type: Number, required: true },
  /** Shows the block whatever the step (the document view). */
  expanded: Boolean,
} as const

/** A `component` node: the registered plugin component in an error boundary, its child blocks as the default slot. */
const ComponentView = defineComponent({
  name: 'PmComponentNode',
  props: blockProps,
  setup(props) {
    return () => {
      const node = props.block.node as ComponentNode
      const component = getComponent(node.name)
      if (!component) {
        // Unknown component: its static fallback, else a note (docs/ir.md section 6).
        const fallback = node.fallback ? hastToVNodes(markdownToHast(node.fallback, props.section.id).children, {}) : []
        return h('div', { 'class': 'pm-component-missing', 'data-component': node.name }, fallback.length ? fallback : `未注册的组件 ${node.name}`)
      }
      const children = node.children?.length
        ? { default: () => node.children!.map(child => h(BlockView, { key: child.id, block: child, section: props.section, step: props.step, expanded: props.expanded })) }
        : undefined
      return h(PmBoundary, { name: node.name }, () => h(component, { ...node.props }, children))
    }
  },
})

function content(props: { block: IRBlock, section: IRSection, step: number, expanded: boolean }): VNode {
  const { node } = props.block
  const custom = (node.type === 'component' && getNodeRenderer(node.name))
    || (node.type === 'code' && getNodeRenderer(`code:${node.lang}`))
    || getNodeRenderer(node.type)
  if (custom) return h(custom, props)
  switch (node.type) {
    case 'markdown': return h(MarkdownView, { block: props.block, step: props.step, expanded: props.expanded, prefix: props.section.id })
    case 'code': return h(CodeBlockView, { block: props.block, step: props.step, expanded: props.expanded })
    case 'component': return h(ComponentView, props)
  }
}

/**
 * One IR block. Hidden blocks keep their place (and their components keep
 * their state), so stepping back and forth never moves the layout. Gives the
 * components inside the block its step through `BLOCK_CONTEXT`.
 */
export const BlockView = defineComponent({
  name: 'PmBlock',
  props: blockProps,
  setup(props) {
    const el = shallowRef<HTMLElement>()
    const step = toRef(props, 'step')
    const local = computed(() => (props.expanded ? FINAL_STEP : props.step - props.block.at))
    provide(BLOCK_CONTEXT, { section: toRef(props, 'section'), block: toRef(props, 'block'), step, local })
    let stop: (() => void) | undefined
    onMounted(() => {
      if (el.value) stop = trackClicks(el.value, local)
    })
    onBeforeUnmount(() => stop?.())
    return () => {
      const { block } = props
      const visible = props.expanded || blockVisible(block, props.step)
      return h('div', {
        'ref': el,
        'class': [BLOCK_CLASS, `pm-block--${block.role}`, `pm-block--${block.node.type}`, { 'pm-hidden': !visible }],
        'data-block': block.id,
        'data-at': block.at,
        'data-component': block.node.type === 'component' ? block.node.name : undefined,
        'aria-hidden': visible ? undefined : 'true',
      }, [content({ block, section: props.section, step: props.step, expanded: props.expanded })])
    }
  },
})
