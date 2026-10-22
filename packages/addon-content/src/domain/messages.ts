import type { Locale } from '@lincyaw/kernel'

export interface ContentMessages {
  plantUml: string
  toggle: (node: string) => string
}

export const MESSAGES: Record<Locale, ContentMessages> = {
  'zh-CN': { plantUml: 'PlantUML 图', toggle: node => `折叠或展开：${node}` },
  'en': { plantUml: 'PlantUML diagram', toggle: node => `Fold or unfold: ${node}` },
}
