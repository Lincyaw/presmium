import { currentLocale } from '@presmium/host'
import type { Catalog } from '@presmium/host'

const zhCN = {
  cancelled: '已取消',
  runTimeout: (ms: number) => `执行超过 ${ms} ms，已停止`,
  loadTimeout: (ms: number) => `WebAssembly 运行时 ${ms} ms 内未加载完成，已停止`,
  loadFailed: (error: string) => `WebAssembly 运行时加载失败：${error}`,
  crashed: (error: string) => `WebAssembly 运行时出错：${error}`,
}

export type WasiMessages = typeof zhCN

const en: WasiMessages = {
  cancelled: 'Cancelled',
  runTimeout: ms => `Stopped after ${ms} ms`,
  loadTimeout: ms => `The WebAssembly runtime did not load within ${ms} ms; stopped`,
  loadFailed: error => `The WebAssembly runtime could not load: ${error}`,
  crashed: error => `The WebAssembly runtime failed: ${error}`,
}

export const MESSAGES: Catalog<WasiMessages> = { 'zh-CN': zhCN, en }

export function messages(): WasiMessages {
  return MESSAGES[currentLocale()]
}
