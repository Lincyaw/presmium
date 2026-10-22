import type { Locale, MdastNode } from '@lincyaw/kernel'

function text(value: string): MdastNode {
  return { type: 'text', value }
}

export const NOTEBOOK_MESSAGES = {
  'zh-CN': {
    web: '网页版',
    note: (name: MdastNode, web: MdastNode): MdastNode[] => [text('交互组件 '), name, text(' 需要在'), web, text('中查看。')],
  },
  'en': {
    web: 'the web version',
    note: (name: MdastNode, web: MdastNode): MdastNode[] => [text('The interactive component '), name, text(' can only be used in '), web, text('.')],
  },
} satisfies Record<Locale, unknown>

export type NotebookMessages = (typeof NOTEBOOK_MESSAGES)[Locale]
