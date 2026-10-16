import { PmBoundary, provideStepScope } from '@presmium/host'
import { fnv1a64 } from '@presmium/kernel'
import type { ComponentNode, IRBlock, IRSection } from '@presmium/kernel'
import type { InjectionKey, PropType, VNode } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, shallowRef } from 'vue'
import { BLOCK_CLASS, trackClicks } from './clicks.ts'
import { CodeBlockView } from './code.ts'
import { IN_COMPONENT } from './context.ts'
import { blockVisible, FINAL_STEP } from './domain/index.ts'
import { messages } from './i18n.ts'
import { hastToVNodes, markdownToHast, MarkdownView } from './markdown.ts'
import { getComponent, getNodeRenderer } from './registry.ts'
import { PmMermaid } from './rich.ts'
import { VIEWER } from './viewer.ts'

const blockProps = {
  block: { type: Object as PropType<IRBlock>, required: true },
  section: { type: Object as PropType<IRSection>, required: true },
  /** The section's step; `FINAL_STEP` shows the final state. */
  step: { type: Number, required: true },
  /** Shows the block whatever the step (the document view). */
  expanded: Boolean,
} as const

/** The component node being rendered and its section, for what stands in for the component (`PmComponentFallback`). */
const COMPONENT_NODE: InjectionKey<{ node: ComponentNode, section: string }> = Symbol('presmium.viewer.componentNode')

/** A component node's static `fallback`, rendered as Markdown; none when it has no fallback. */
function fallbackOf(node: ComponentNode, section: string): VNode[] {
  return node.fallback ? hastToVNodes(markdownToHast(node.fallback, section).children, {}) as VNode[] : []
}

/**
 * What the component node being rendered shows without running (its IR
 * `fallback`), e.g. for a host to render until the component itself has
 * loaded in the browser, so readers without JavaScript see it too.
 */
export const PmComponentFallback = defineComponent({
  name: 'PmComponentFallback',
  setup() {
    const current = inject(COMPONENT_NODE, undefined)
    return () => (current ? fallbackOf(current.node, current.section) : null)
  },
})

/**
 * A `component` node: the registered plugin component in an error boundary,
 * its child blocks as the default slot. The boundary renders the component
 * again when its props or children change (a live update) and, where it
 * follows the steps, at each step (K-11).
 */
const ComponentView = defineComponent({
  name: 'PmComponentNode',
  props: blockProps,
  setup(props) {
    provide(IN_COMPONENT, true)
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
      const component = getComponent(node.name)
      if (!component) {
        // Unknown component: its static fallback, else a note (docs/ir.md section 6).
        const fallback = fallbackOf(node, props.section.id)
        return h('div', { 'class': 'pm-component-missing', 'data-component': node.name }, fallback.length ? fallback : messages().missingComponent(node.name))
      }
      const children = node.children?.length
        ? { default: () => node.children!.map(child => h(BlockView, { key: child.id, block: child, section: props.section, step: props.step, expanded: props.expanded })) }
        : undefined
      const resetKey = props.expanded ? content.value : `${content.value}@${props.step}`
      return h(PmBoundary, { name: node.name, resetKey }, () => h(component, { ...node.props }, children))
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
    // A ```mermaid block is a diagram, as in the slides (docs/ir.md section 8.1).
    case 'code': return node.lang === 'mermaid'
      ? h(PmMermaid, { code: node.value })
      : h(CodeBlockView, { block: props.block, step: props.step, expanded: props.expanded })
    case 'component': return h(ComponentView, props)
  }
}

/** Whether a block draws over the page instead of taking a place in it (`ComponentNode.layer`). */
export function isOverlay(block: IRBlock): boolean {
  return block.node.type === 'component' && block.node.layer === 'overlay'
}

/**
 * One IR block. Hidden blocks keep their place (and their components keep
 * their state), so stepping back and forth never moves the layout. The
 * components inside count their steps from the block's `at` (its step scope).
 */
export const BlockView = defineComponent({
  name: 'PmBlock',
  props: blockProps,
  setup(props) {
    const viewer = inject(VIEWER, undefined)
    const el = shallowRef<HTMLElement>()
    // The components of the block count their internal steps from its `at` (docs/ir.md 2.4);
    // their clicks are steps of the section, as in a slide.
    provideStepScope(() => props.block.at)
    const clicks = computed(() => (props.expanded ? FINAL_STEP : props.step))
    let stop: (() => void) | undefined
    onMounted(() => {
      if (el.value) stop = trackClicks(el.value, clicks)
    })
    onBeforeUnmount(() => stop?.())
    // Alt+click opens the block's source in the editor, where the dev server offers it.
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
        'class': [BLOCK_CLASS, `pm-block--${block.role}`, `pm-block--${block.node.type}`, { 'pm-block--overlay': isOverlay(block), 'pm-hidden': !visible }],
        'data-block': block.id,
        'data-at': block.at,
        'data-component': block.node.type === 'component' ? block.node.name : undefined,
        'aria-hidden': visible ? undefined : 'true',
        'onClick': viewer?.options.openSource ? openSource : undefined,
      }, [content({ block, section: props.section, step: props.step, expanded: props.expanded })])
    }
  },
})
