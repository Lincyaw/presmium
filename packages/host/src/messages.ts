import type { PluginStatus } from '@lincyaw/kernel/contracts'
import type { Catalog } from './locale.ts'

export interface HostMessages {
  panels: string
  startReport: string
  starting: string
  noPlugins: string
  status: Record<PluginStatus, string>
  because: string
  componentError(component: string, message: string): string
  problems(count: number): string
  approvals(count: number): string
  approvalsTitle: string
  allow: string
  deny: string
  answerFailed: string
  close: string
  from(who: string): string
}

export const HOST_MESSAGES: Catalog<HostMessages> = {
  'zh-CN': {
    panels: '课堂与工具',
    startReport: '启动报告',
    starting: '正在启动…',
    noPlugins: '没有注册插件。',
    status: { started: '已启动', degraded: '已降级', disabled: '已禁用', failed: '启动失败' },
    because: '：',
    componentError: (component, message) => `${component} 出错：${message}`,
    problems: count => `${count} 个问题`,
    approvals: count => `待确认 ${count}`,
    approvalsTitle: '待确认的操作',
    allow: '允许',
    deny: '拒绝',
    answerFailed: '无法发送答复。请重试。',
    close: '关闭',
    from: who => `来自 ${who}`,
  },
  'en': {
    panels: 'Classroom and Tools',
    startReport: 'Startup Report',
    starting: 'Starting…',
    noPlugins: 'No plugins registered.',
    status: { started: 'Started', degraded: 'Degraded', disabled: 'Disabled', failed: 'Failed to start' },
    because: ': ',
    componentError: (component, message) => `${component} failed: ${message}`,
    problems: count => `${count} ${count === 1 ? 'problem' : 'problems'}`,
    approvals: count => `Pending Approvals (${count})`,
    approvalsTitle: 'Pending Approvals',
    allow: 'Allow',
    deny: 'Deny',
    answerFailed: 'Couldn’t send the answer. Please try again.',
    close: 'Close',
    from: who => `from ${who}`,
  },
}
