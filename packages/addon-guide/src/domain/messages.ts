import type { Locale } from '@lincyaw/kernel/contracts'

export interface CueMessages {
  separator: string
}

export const CUE_MESSAGES: Record<Locale, CueMessages> = {
  'zh-CN': { separator: '：' },
  'en': { separator: ': ' },
}
