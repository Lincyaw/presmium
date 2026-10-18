import type { Locale } from '@presmium/kernel'

export interface ContentMessages {
  counter: string
  colon: string
  plantUml: string
  toggle: (node: string) => string
}

export const MESSAGES: Record<Locale, ContentMessages> = {
  'zh-CN': { counter: '计数', colon: '：', plantUml: 'PlantUML 图', toggle: node => `折叠或展开：${node}` },
  'en': { counter: 'Count', colon: ': ', plantUml: 'PlantUML diagram', toggle: node => `Fold or unfold: ${node}` },
}
