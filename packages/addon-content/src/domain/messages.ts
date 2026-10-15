/**
 * The plugin's words in the languages it speaks (N-07): a page's language is
 * its `<html lang>`, else the browser's; a compiled deck's is its `lang`.
 */
export type Locale = 'zh-CN' | 'en'

/** The first of the language tags the plugin speaks; Chinese when none is. */
export function localeOf(...tags: unknown[]): Locale {
  for (const tag of tags) {
    const lang = typeof tag === 'string' ? tag.trim().toLowerCase() : ''
    if (lang.startsWith('zh')) return 'zh-CN'
    if (lang.startsWith('en')) return 'en'
  }
  return 'zh-CN'
}

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
