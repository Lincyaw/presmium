import type { Locale } from '@presmium/kernel'

const zhCN = {
  highContrast: '高对比度',
  highContrastState: (on: boolean) => `高对比度：${on ? '开' : '关'}`,
  saveOffline: (megabytes: number) => `保存以离线使用（${megabytes} MB）`,
  savingOffline: '正在保存以离线使用……',
  savedOffline: '已保存，可离线使用',
  saveOfflineFailed: '保存失败，请联网后重试',
}

export type PublishMessages = typeof zhCN

const en: PublishMessages = {
  highContrast: 'High contrast',
  highContrastState: on => `High contrast: ${on ? 'on' : 'off'}`,
  saveOffline: megabytes => `Save for offline use (${megabytes} MB)`,
  savingOffline: 'Saving for offline use…',
  savedOffline: 'Saved for offline use',
  saveOfflineFailed: 'Saving failed; try again online',
}

export const MESSAGES: Record<Locale, PublishMessages> = { 'zh-CN': zhCN, en }
