import { Children, createElement as h, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { PmColumns, PmStack, PmTabGroup, useMessages, useStaticRender } from '@lincyaw/host'
import type { ContentLayoutProps } from '@lincyaw/host'
import { blockVisible } from '@lincyaw/kernel'
import type { BlockProps } from './block.ts'
import { FINAL_STEP } from '../domain/index.ts'
import { useSectionContext } from './section-context.ts'

const MESSAGES = { 'zh-CN': { tabs: '分组内容', item: (index: number) => `内容 ${index}` }, en: { tabs: 'Grouped content', item: (index: number) => `Content ${index}` } }
function LayoutTabs({ title, tabTitles, children }: ContentLayoutProps & { tabTitles?: string[] }) {
  const t = useMessages(MESSAGES), printed = useStaticRender(), section = useSectionContext()
  const tabs = Children.toArray(children).map((content, index) => {
    const props = isValidElement<BlockProps>(content) ? content.props : undefined
    return { id: props?.block?.id ?? String(index), title: tabTitles?.[index] || t.item(index + 1), content,
      visible: !props?.block || props.expanded || blockVisible(props.block, section?.step ?? FINAL_STEP) }
  })
  return h(PmTabGroup, { title, label: t.tabs, tabs, staticView: printed })
}

/** Layout nodes are part of the document runtime and need no separately installed plugin. */
export const DOCUMENT_LAYOUT_COMPONENTS = { PmColumns, PmStack, PmTabs: LayoutTabs }
