/** The guidance cues' text (N-07), in Chinese and English, as a catalog of @presmium/host. */
import type { Locale } from '@presmium/kernel/contracts'

export interface CueMessages {
  /** Between a cue's title and its text, where both show in one line (the static copy, a note beside the target). */
  separator: string
}

export const CUE_MESSAGES: Record<Locale, CueMessages> = {
  'zh-CN': { separator: '：' },
  'en': { separator: ': ' },
}
