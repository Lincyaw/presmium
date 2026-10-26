import { createContext, memo, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { PmBoundary, StepScope, useStaticRender, useStore } from '@lincyaw/host'
import { blockStepState, blockVisible, componentProps, fnv1a64 } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, IRSection } from '@lincyaw/kernel'
import { FINAL_STEP } from '../domain/index.ts'
import { CODE_OWNED, CodeBlockView } from './code/code-block.ts'
import { contentMarks } from './content-marks.ts'
import { markdownToHast } from './markdown/handlers.ts'
import { PmMermaid } from './markdown/mermaid.ts'
import { hastToVNodes, MarkdownView } from './markdown/render.ts'
import { findComponent, findNodeRenderer, registryRevision } from './registry.ts'
import { BLOCK_CLASS, trackClicks } from './slidev-compat/click-directives.ts'
import { viewerMessages } from './viewer-messages.ts'
import { VIEWER } from './viewer-state.ts'
import { h } from './element.ts'
import { SECTION_CONTEXT } from './section-context.ts'
export interface BlockProps { block: IRBlock, section: IRSection, step: number, expanded?: boolean }
const COMPONENT_NODE = createContext<{ node: ComponentNode, section: string } | undefined>(undefined)
function fallbackOf(node: ComponentNode, section: string) { return node.fallback ? hastToVNodes(markdownToHast(node.fallback, section).children, {}) : [] }
export function PmComponentFallback() { const current = useContext(COMPONENT_NODE); return current ? h('div', { className: 'pm-component-fallback' }, fallbackOf(current.node, current.section)) : null }
function ComponentView(props: BlockProps) {
  const node = props.block.node as ComponentNode
  const printed = useStaticRender()
  useStore(registryRevision)
  const component = findComponent(node.name)
  if (printed && node.fallback) return h('div', { className: 'pm-static-fallback', 'data-component': node.name }, fallbackOf(node, props.section.id))
  if (!component) { const fallback = fallbackOf(node, props.section.id); return h('div', { className: 'pm-component-missing', 'data-component': node.name }, fallback.length ? fallback : viewerMessages().missingComponent(node.name)) }
  const state = blockStepState(props.block, props.step)
  const children = node.children?.map(child => h(BlockView, { key: child.id, block: child, section: props.section, step: props.step, expanded: props.expanded }))
  const key = fnv1a64(JSON.stringify([node.props, node.children ?? []]))
  return h(CODE_OWNED.Provider, { value: node.ownsCode !== false }, h(COMPONENT_NODE.Provider, { value: { node, section: props.section.id } }, h(PmBoundary, { name: node.name, resetKey: props.expanded ? key : `${key}@${props.step}` }, h(component, { ...componentProps(node), ...state?.parameters }, children))))
}
function content(props: BlockProps): ReactNode {
  const node = props.block.node
  const custom = (node.type === 'component' && findNodeRenderer(node.name)) || (node.type === 'code' && findNodeRenderer(`code:${node.lang}`)) || findNodeRenderer(node.type)
  if (custom) return h(custom, props)
  switch (node.type) {
    case 'markdown': return h(MarkdownView, { ...props, prefix: props.section.id })
    case 'code': return node.lang === 'mermaid' ? h(PmMermaid, { code: node.value }) : h(CodeBlockView, props)
    case 'component': return h(ComponentView, props)
  }
}
function BlockViewContent(props: BlockProps) {
  const viewer = useContext(VIEWER); const doc = useStore(viewer?.doc); const el = useRef<HTMLDivElement>(null)
  useStore(registryRevision)
  useEffect(() => el.current ? trackClicks(el.current, props.expanded ? FINAL_STEP : props.step) : undefined, [props.step, props.expanded, props.block])
  const { block } = props
  const visible = props.expanded || blockVisible(block, props.step)
  const script = doc?.config.renderers.lecture?.script
  const role = block.role === 'narration' && ((block.only && !block.only.includes('lecture')) || (typeof script === 'string' && script.trim())) ? 'reading' : block.role
  return h(StepScope, { at: block.at, until: block.until, states: block.stepStates, step: props.step }, h('div', {
    ref: el, className: [BLOCK_CLASS, `pm-block--${block.role}`, `pm-block--${block.node.type}`, block.until !== undefined ? 'pm-step-range' : '', block.node.type === 'component' && block.node.layer === 'overlay' ? 'pm-block--overlay' : '', !visible ? 'pm-hidden' : ''].filter(Boolean).join(' '),
    'data-block': block.id, 'data-content-role': role, 'data-content-label': viewerMessages().contentRoles[role], 'data-at': block.at, 'data-component': block.node.type === 'component' ? block.node.name : undefined, 'aria-hidden': visible ? undefined : true,
    onClick: viewer?.options.openSource ? (event: MouseEvent) => { if (event.altKey) { event.preventDefault(); event.stopPropagation(); viewer.options.openSource!(block.source) } } : undefined,
  }, [contentMarks(props.section, role, block.at, block.span ?? 0), content(props)]))
}

export const BlockView = memo(BlockViewContent)

/** A compiled block's standalone read-only surface, using the same host scope as the full viewer. */
export function BlockPreview({ block, section }: { block: IRBlock, section: IRSection }) {
  return h(SECTION_CONTEXT.Provider, { value: { section, step: FINAL_STEP, view: 'document' } }, h('div', { className: 'pm-document pm-block-preview', 'data-section': section.id }, h(BlockView, { block, section, step: FINAL_STEP, expanded: true })))
}
