import type { Locale } from '@lincyaw/kernel'

const zhCN = {
  highContrast: '高对比度',
  highContrastState: (on: boolean) => `高对比度：${on ? '开' : '关'}`,
  saveOffline: (megabytes: number) => `保存以离线使用（${megabytes} MB）`,
  savingOffline: '正在保存以离线使用…',
  savedOffline: '已保存，可离线使用',
  saveOfflineFailed: '无法保存以离线使用。请联网后重试。',
}

export type PublishMessages = typeof zhCN

const en: PublishMessages = {
  highContrast: 'High contrast',
  highContrastState: on => `High contrast: ${on ? 'on' : 'off'}`,
  saveOffline: megabytes => `Save for Offline Use (${megabytes} MB)`,
  savingOffline: 'Saving for offline use…',
  savedOffline: 'Saved for offline use',
  saveOfflineFailed: 'Couldn’t save for offline use. Please try again when online.',
}

export const MESSAGES: Record<Locale, PublishMessages> = { 'zh-CN': zhCN, en }
