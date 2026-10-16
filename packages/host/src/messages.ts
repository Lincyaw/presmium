import type { PluginStatus } from '@presmium/kernel/contracts'
import type { Catalog } from './locale.ts'

export interface HostMessages {
  /** The presenter panels' heading: what they hold, the start report among the plugins' panels. */
  panels: string
  startReport: string
  starting: string
  noPlugins: string
  status: Record<PluginStatus, string>
  /** Between a status and its reason. */
  because: string
  componentError(component: string, message: string): string
  problems(count: number): string
}

export const HOST_MESSAGES: Catalog<HostMessages> = {
  'zh-CN': {
    panels: '课堂与工具',
    startReport: '启动报告',
    starting: '内核启动中……',
    noPlugins: '没有注册插件。',
    status: { started: '已启动', degraded: '已降级', disabled: '已禁用', failed: '启动失败' },
    because: '：',
    componentError: (component, message) => `${component} 出错：${message}`,
    problems: count => `${count} 个问题`,
  },
  'en': {
    panels: 'Panels',
    startReport: 'Start report',
    starting: 'Starting the kernel…',
    noPlugins: 'No plugins registered.',
    status: { started: 'started', degraded: 'degraded', disabled: 'disabled', failed: 'failed to start' },
    because: ': ',
    componentError: (component, message) => `${component} failed: ${message}`,
    problems: count => `${count} ${count === 1 ? 'problem' : 'problems'}`,
  },
}
