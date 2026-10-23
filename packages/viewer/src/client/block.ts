import { PmBoundary, provideStepScope } from '@lincyaw/host'
import { blockVisible, componentProps, fnv1a64 } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, IRSection } from '@lincyaw/kernel'
import type { InjectionKey, PropType, VNode } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, shallowRef } from 'vue'
import { FINAL_STEP } from '../domain/index.ts'
import { CODE_OWNED, CodeBlockView } from './code/code-block.ts'
import { markdownToHast } from './markdown/handlers.ts'
import { PmMermaid } from './markdown/mermaid.ts'
import { hastToVNodes, MarkdownView } from './markdown/render.ts'
import { findComponent, findNodeRenderer } from './registry.ts'
import { BLOCK_CLASS, trackClicks } from './slidev-compat/click-directives.ts'
import { viewerMessages } from './viewer-messages.ts'
import { VIEWER } from './viewer-state.ts'

const blockProps = {
  block: { type: Object as PropType<IRBlock>, required: true },
  section: { type: Object as PropType<IRSection>, required: true },
  step: { type: Number, required: true },
  expanded: Boolean,
} as const

const COMPONENT_NODE: InjectionKey<{ node: ComponentNode, section: string }> = Symbol('presmium.viewer.componentNode')

function fallbackOf(node: ComponentNode, section: string): VNode[] {
  return node.fallback ? hastToVNodes(markdownToHast(node.fallback, section).children, {}) as VNode[] : []
}

export const PmComponentFallback = defineComponent({
  name: 'PmComponentFallback',
  setup() {
    const current = inject(COMPONENT_NODE, undefined)
    return () => (current ? fallbackOf(current.node, current.section) : null)
  },
})

const ComponentView = defineComponent({
  name: 'PmComponentNode',
  props: blockProps,
  setup(props) {
    provide(CODE_OWNED, computed(() => (props.block.node as ComponentNode).ownsCode !== false))
    provide(COMPONENT_NODE, {
      get node() {
        return props.block.node as ComponentNode
      },
      get section() {
        return props.section.id
      },
    })
    const content = computed(() => {
      const { props: values, children } = props.block.node as ComponentNode
      return fnv1a64(JSON.stringify([values, children ?? []]))
    })
    return () => {
      const node = props.block.node as ComponentNode
      const component = findComponent(node.name)
      if (!component) {
        const fallback = fallbackOf(node, props.section.id)
        return h('div', { 'class': 'pm-component-missing', 'data-component': node.name }, fallback.length ? fallback : viewerMessages().missingComponent(node.name))
      }
      const children = node.children?.length
        ? { default: () => node.children!.map(child => h(BlockView, { key: child.id, block: child, section: props.section, step: props.step, expanded: props.expanded })) }
        : undefined
      const resetKey = props.expanded ? content.value : `${content.value}@${props.step}`
      return h(PmBoundary, { name: node.name, resetKey }, () => h(component, componentProps(node), children))
    }
  },
})

function content(props: { block: IRBlock, section: IRSection, step: number, expanded: boolean }): VNode {
  const { node } = props.block
  const custom = (node.type === 'component' && findNodeRenderer(node.name))
    || (node.type === 'code' && findNodeRenderer(`code:${node.lang}`))
    || findNodeRenderer(node.type)
  if (custom) return h(custom, props)
  switch (node.type) {
    case 'markdown': return h(MarkdownView, { block: props.block, step: props.step, expanded: props.expanded, prefix: props.section.id })
    case 'code': return node.lang === 'mermaid'
      ? h(PmMermaid, { code: node.value })
      : h(CodeBlockView, { block: props.block, step: props.step, expanded: props.expanded })
    case 'component': return h(ComponentView, props)
  }
}

function isOverlay(block: IRBlock): boolean {
  return block.node.type === 'component' && block.node.layer === 'overlay'
}

export const BlockView = defineComponent({
  name: 'PmBlock',
  props: blockProps,
  setup(props) {
    const viewer = inject(VIEWER, undefined)
    const el = shallowRef<HTMLElement>()
    provideStepScope(() => props.block.at, () => props.block.until)
    const clicks = computed(() => (props.expanded ? FINAL_STEP : props.step))
    let stop: (() => void) | undefined
    onMounted(() => {
      if (el.value) stop = trackClicks(el.value, clicks)
    })
    onBeforeUnmount(() => stop?.())
    const openSource = (event: MouseEvent) => {
      if (!event.altKey || !viewer?.options.openSource) return
      event.preventDefault()
      event.stopPropagation()
      viewer.options.openSource(props.block.source)
    }
    return () => {
      const { block } = props
      const visible = props.expanded || blockVisible(block, props.step)
      return h('div', {
        'ref': el,
        'class': [BLOCK_CLASS, `pm-block--${block.role}`, `pm-block--${block.node.type}`, { 'pm-step-range': block.until !== undefined, 'pm-block--overlay': isOverlay(block), 'pm-hidden': !visible }],
        'data-block': block.id,
        'data-at': block.at,
        'data-component': block.node.type === 'component' ? block.node.name : undefined,
        'aria-hidden': visible ? undefined : 'true',
        'onClick': viewer?.options.openSource ? openSource : undefined,
      }, [content({ block, section: props.section, step: props.step, expanded: props.expanded })])
    }
  },
})
