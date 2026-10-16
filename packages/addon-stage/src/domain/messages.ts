/** The stage's interface text (N-07), in Chinese and English, as a catalog of @presmium/host. */
import type { Locale } from '@presmium/kernel/contracts'

const zh = {
  /** The presenter's reminder of what the audience sees. */
  badge: { black: '听众视图已黑屏', frozen: '听众视图已冻结' },
}

export type StageMessages = typeof zh

const en: StageMessages = {
  badge: { black: 'Audience view blacked out', frozen: 'Audience view frozen' },
}

export const STAGE_MESSAGES: Record<Locale, StageMessages> = { 'zh-CN': zh, 'en': en }
