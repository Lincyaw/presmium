/**
 * The plugin's words in the languages it speaks (N-07): a page's are chosen
 * by `@presmium/host` (`currentLocale`), a compiled deck's by its `lang`
 * (`deckLocale`).
 */
import type { Locale } from '@presmium/kernel'

export interface ContentMessages {
  /** The demo counter's default label, and what follows a label. */
  counter: string
  colon: string
  /** Alternative text of a PlantUML diagram without a title. */
  plantUml: string
  /** The name of a mindmap node's fold toggle, read by assistive technology. */
  toggle: (node: string) => string
}

export const MESSAGES: Record<Locale, ContentMessages> = {
  'zh-CN': { counter: '计数', colon: '：', plantUml: 'PlantUML 图', toggle: node => `折叠或展开：${node}` },
  'en': { counter: 'Count', colon: ': ', plantUml: 'PlantUML diagram', toggle: node => `Fold or unfold: ${node}` },
}
