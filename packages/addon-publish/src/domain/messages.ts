/**
 * UI strings of the publishing plugin in zh-CN and en (N-07), chosen by
 * `@presmium/host` (`useMessages`, `currentLocale`).
 */
import type { Locale } from '@presmium/kernel'

const zhCN = {
  highContrast: '高对比度',
  highContrastState: (on: boolean) => `高对比度：${on ? '开' : '关'}`,
}

export type PublishMessages = typeof zhCN

const en: PublishMessages = {
  highContrast: 'High contrast',
  highContrastState: on => `High contrast: ${on ? 'on' : 'off'}`,
}

export const MESSAGES: Record<Locale, PublishMessages> = { 'zh-CN': zhCN, en }
