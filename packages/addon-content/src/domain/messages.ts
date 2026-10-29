import type { Locale } from '@lincyaw/kernel'

export interface ContentMessages {
  plantUml: string
  mediaPlaybackFailed: string
  toggle: (node: string) => string
}

export const MESSAGES: Record<Locale, ContentMessages> = {
  'zh-CN': { plantUml: 'PlantUML 图', mediaPlaybackFailed: '无法播放媒体。请检查文件或播放权限，然后重试。', toggle: node => `折叠或展开：${node}` },
  'en': { plantUml: 'PlantUML diagram', mediaPlaybackFailed: 'Couldn’t play the media. Check the file or playback permission, then try again.', toggle: node => `Fold or unfold: ${node}` },
}
