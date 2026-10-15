/**
 * UI strings of the execution plugin in zh-CN and en (N-07), chosen as by
 * @presmium/host's useLocale: the page's language (`<html lang>`, which both
 * forms set from the deck) when it is zh-* or en-*, else the browser's, else
 * English.
 */
import { computed, ref } from 'vue'
import type { ComputedRef } from 'vue'

const zhCN = {
  run: '运行',
  rerun: '重跑',
  running: '运行中…',
  unavailable: '执行服务不可用',
  timedOut: '执行超时',
  failed: '执行失败',
  recordedBadge: (reason: string) => `预录输出 · ${reason}`,
  recordedLine: (reason: string) => `预录输出（${reason}）`,
  recorded: '预录',
  succeeded: '成功',
  failedShort: '失败',
  compare: (before: number, after: number) => `对比 #${before} → #${after}`,
  argChange: (name: string, before: string, after: string) => `${name}：${before} → ${after}`,
  tracing: '正在追踪执行……',
  traceFailed: '追踪失败',
  stepOf: (step: number, total: number) => `第 ${step} / ${total} 步`,
  atLine: (line: number) => ` · 第 ${line} 行`,
  truncated: '（已截断）',
  stepsMismatch: (declared: number, traced: number) => `steps 声明为 ${declared}，实际执行 ${traced} 行`,
  stepsMissing: (traced: number) => `未声明 steps（应为 ${traced}），直接打开某一步时无法恢复`,
  cancelled: '已取消',
  runTimeout: (ms: number) => `执行超过 ${ms} ms，已停止`,
  runtimeCrashed: (runtime: string, error: string) => `${runtime} 运行时出错：${error}`,
  loadTimeout: (runtime: string, ms: number) => `${runtime} 运行时 ${ms} ms 内未加载完成，已停止`,
  noExecutor: (lang: string) => `没有支持 ${lang} 的执行器`,
  executorCrashed: (id: string, error: string) => `执行器 ${id} 出错：${error}`,
}

export type ExecMessages = typeof zhCN

const en: ExecMessages = {
  run: 'Run',
  rerun: 'Run again',
  running: 'Running…',
  unavailable: 'Execution service unavailable',
  timedOut: 'timed out',
  failed: 'run failed',
  recordedBadge: reason => `Recorded output · ${reason}`,
  recordedLine: reason => `Recorded output (${reason})`,
  recorded: 'recorded',
  succeeded: 'ok',
  failedShort: 'failed',
  compare: (before, after) => `Compare #${before} → #${after}`,
  argChange: (name, before, after) => `${name}: ${before} → ${after}`,
  tracing: 'Tracing the run…',
  traceFailed: 'Tracing failed',
  stepOf: (step, total) => `Step ${step} / ${total}`,
  atLine: line => ` · line ${line}`,
  truncated: ' (truncated)',
  stepsMismatch: (declared, traced) => `steps is declared as ${declared}, but ${traced} lines ran`,
  stepsMissing: traced => `steps is not declared (it should be ${traced}); opening a step directly cannot restore it`,
  cancelled: 'Cancelled',
  runTimeout: ms => `Stopped after ${ms} ms`,
  runtimeCrashed: (runtime, error) => `The ${runtime} runtime failed: ${error}`,
  loadTimeout: (runtime, ms) => `The ${runtime} runtime did not load within ${ms} ms; stopped`,
  noExecutor: lang => `No executor runs ${lang}`,
  executorCrashed: (id, error) => `Executor ${id} failed: ${error}`,
}

/** 'zh-CN' for a zh-* tag, 'en' for en-*; undefined for languages without strings. */
function localeOf(tag: string): 'zh-CN' | 'en' | undefined {
  return /^zh(-|$)/i.test(tag) ? 'zh-CN' : /^en(-|$)/i.test(tag) ? 'en' : undefined
}

function detect(): 'zh-CN' | 'en' {
  // Server-side rendering has no page; the plugin's components render in the browser.
  if (typeof document === 'undefined') return 'zh-CN'
  return localeOf(document.documentElement.lang) ?? localeOf(navigator.language) ?? 'en'
}

const locale = ref(detect())
// A form may set <html lang> after the plugins start (Slidev applies its htmlAttrs at runtime).
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    locale.value = detect()
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
}

/** The strings of the page's language, read when a string is needed. */
export function messages(): ExecMessages {
  return locale.value === 'en' ? en : zhCN
}

/** For components: the strings, following the page's language. */
export function useMessages(): ComputedRef<ExecMessages> {
  return computed(messages)
}
