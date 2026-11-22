import type { VoiceInfo } from '@lincyaw/kernel'

// Edge's read-aloud voices go by the same names whether Node reaches Edge itself (the "edge" engine) or a local
// OpenAI-compatible bridge relays them: the label is the name an author knows, the gender and language say the rest.

/** The names the Chinese voices go by. */
const CHINESE_NAMES: Record<string, string> = {
  Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Yunjian: '云健', Yunxi: '云希', Yunxia: '云夏', Yunyang: '云扬', Xiaobei: '晓北', Xiaoni: '晓妮',
  HiuGaai: '曉佳', HiuMaan: '曉曼', WanLung: '雲龍', HsiaoChen: '曉臻', HsiaoYu: '曉雨', YunJhe: '雲哲',
}

/** An Edge voice's identifier: its locale (with a dialect after the region, as in zh-CN-liaoning), then its name. */
const EDGE_ID = /^([a-z]{2,3}-[A-Z]{2}(?:-[a-z]+)?)-([A-Za-z]+)Neural$/

/** The voice an Edge identifier names (zh-CN-YunxiNeural is 云希, a man's voice in zh-CN); undefined for other identifiers. */
export function edgeVoice(id: string, gender?: string): VoiceInfo | undefined {
  const match = EDGE_ID.exec(id)
  if (!match) return undefined
  const [, locale, own] = match as unknown as [string, string, string]
  const multilingual = own.endsWith('Multilingual'), name = own.replace(/Multilingual$/, '')
  const known = /^female$/i.test(gender ?? '') ? 'female' : /^male$/i.test(gender ?? '') ? 'male' : undefined
  return { id, label: `${CHINESE_NAMES[name] ?? name}${multilingual ? ' Multilingual' : ''}`, lang: [locale], ...known ? { gender: known } : {} }
}
