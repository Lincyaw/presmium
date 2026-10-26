import type { Locale } from '@lincyaw/kernel'

export interface ContentMessages {
  plantUml: string
  mediaPlaybackFailed: string
  toggle: (node: string) => string
}

export const MESSAGES: Record<Locale, ContentMessages> = {
  'zh-CN': { plantUml: 'PlantUML 图', mediaPlaybackFailed: '媒体未能播放，请检查文件或播放权限后重试。', toggle: node => `折叠或展开：${node}` },
  'en': { plantUml: 'PlantUML diagram', mediaPlaybackFailed: 'Media could not play. Check the file or playback permission, then retry.', toggle: node => `Fold or unfold: ${node}` },
}
