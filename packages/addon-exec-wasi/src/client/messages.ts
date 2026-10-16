/**
 * UI strings of the WebAssembly executor in zh-CN and en (N-07): the reasons a
 * run could not happen, which the code block shows beside its recorded
 * output, in the UI language of @presmium/host.
 */
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

/** The strings of the UI language, read when a string is needed. */
export function messages(): WasiMessages {
  return MESSAGES[currentLocale()]
}
