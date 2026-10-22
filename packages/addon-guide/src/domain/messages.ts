import type { Locale } from '@lincyaw/kernel/contracts'

export interface GuideMessages {
  separator: string
}

export const GUIDE_MESSAGES: Record<Locale, GuideMessages> = {
  'zh-CN': { separator: '：' },
  'en': { separator: ': ' },
}
