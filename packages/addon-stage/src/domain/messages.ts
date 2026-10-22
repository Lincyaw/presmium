import type { Locale } from '@lincyaw/kernel/contracts'

const zh = {
  badge: { black: '听众视图已黑屏', frozen: '听众视图已冻结' },
}

export type StageMessages = typeof zh

const en: StageMessages = {
  badge: { black: 'Audience view blacked out', frozen: 'Audience view frozen' },
}

export const MESSAGES: Record<Locale, StageMessages> = { 'zh-CN': zh, 'en': en }
