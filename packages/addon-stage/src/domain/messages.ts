/**
 * The stage's interface text (N-07), in Chinese and English. The language is
 * the page's (`<html lang>`), else the browser's; any language other than
 * Chinese gets English.
 */
const zh = {
  /** The presenter's reminder of what the audience sees. */
  badge: { black: '听众视图已黑屏', frozen: '听众视图已冻结' },
}

export type StageMessages = typeof zh

const en: StageMessages = {
  badge: { black: 'Audience view blacked out', frozen: 'Audience view frozen' },
}

export function stageLocale(lang: string | undefined): 'zh-CN' | 'en' {
  return !lang || /^zh\b/i.test(lang) ? 'zh-CN' : 'en'
}

export function messagesFor(lang: string | undefined): StageMessages {
  return stageLocale(lang) === 'en' ? en : zh
}
