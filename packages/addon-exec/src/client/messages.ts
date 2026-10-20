import { currentLocale, useMessages as useCatalog } from '@lincyaw/host'
import type { Catalog } from '@lincyaw/host'
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
  recordedOutput: '预录输出',
  runHint: (icon: string) => `按 ${icon} 运行这段代码`,
  runsIn: {
    browser: '浏览器中运行',
    machine: '本机运行',
    remote: (name: string) => `在远端环境 ${name} 中运行`,
    environment: (name: string) => `在环境 ${name} 中运行`,
  },
  output: '输出',
  outputTook: (seconds: string) => `输出 · ${seconds} 秒`,
  droppedImage: '图片输出的数据不是 base64，未显示',
  gpuUnavailable: (detail: string) => (/no gpu adapter/i.test(detail) ? '没有可用的 GPU 适配器' : /no webgpu/i.test(detail) ? '浏览器没有 WebGPU' : `GPU 不可用：${detail}`),
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
  executorUnavailable: (id: string, lang: string) => `执行器 ${id} 不可用（未登记或不支持 ${lang}）`,
  resetSession: '重置会话',
  executorCrashed: (id: string, error: string) => `执行器 ${id} 出错：${error}`,
  stepper: '逐行执行的步骤',
  previousStep: '上一步',
  nextStep: '下一步',
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
  recordedOutput: 'Recorded output',
  runHint: icon => `Press ${icon} to run this code`,
  runsIn: {
    browser: 'runs in the browser',
    machine: 'runs on this machine',
    remote: name => `runs in the remote environment ${name}`,
    environment: name => `runs in the environment ${name}`,
  },
  output: 'Output',
  outputTook: seconds => `Output · ${seconds} s`,
  droppedImage: 'The image output does not hold base64 data and is not shown',
  gpuUnavailable: detail => (/no gpu adapter/i.test(detail) ? 'No GPU adapter is available' : /no webgpu/i.test(detail) ? 'This browser has no WebGPU' : `The GPU is unavailable: ${detail}`),
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
  executorUnavailable: (id, lang) => `Executor ${id} is unavailable (not registered, or it does not run ${lang})`,
  resetSession: 'Reset session',
  executorCrashed: (id, error) => `Executor ${id} failed: ${error}`,
  stepper: 'Steps of the run',
  previousStep: 'Previous step',
  nextStep: 'Next step',
}

export const MESSAGES: Catalog<ExecMessages> = { 'zh-CN': zhCN, en }

export function messages(): ExecMessages {
  return MESSAGES[currentLocale()]
}

export function useMessages(): ComputedRef<ExecMessages> {
  return useCatalog(MESSAGES)
}
