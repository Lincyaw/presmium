/** The server's own words (N-07): the owner console's, in zh-CN and en. */
import type { Locale } from '@presmium/kernel'

export interface ConsoleMessages {
  title: string
  heading: string
  connecting: string
  approvals: string
  none: string
  routes: string
  route: string
  rest: string
  file: string
  send: string
  /** What the console's script says. */
  script: {
    allow: string
    deny: string
    from: string
    member: string
    connected: string
    lost: string
  }
}

export const CONSOLE_MESSAGES: Record<Locale, ConsoleMessages> = {
  'zh-CN': {
    title: 'Presmium 所有者控制台',
    heading: '所有者控制台',
    connecting: '连接中……',
    approvals: '待确认',
    none: '没有待确认的操作。',
    routes: '所有者路由',
    route: '路由',
    rest: '路径的其余部分',
    file: '文件',
    send: '发送',
    script: { allow: '允许', deny: '拒绝', from: '来自', member: '发起人', connected: '已连接', lost: '连接中断，正在重连……' },
  },
  'en': {
    title: 'Presmium owner console',
    heading: 'Owner console',
    connecting: 'Connecting…',
    approvals: 'Approvals',
    none: 'Nothing to approve.',
    routes: 'Owner routes',
    route: 'Route',
    rest: 'Rest of the path',
    file: 'File',
    send: 'Send',
    script: { allow: 'Allow', deny: 'Deny', from: 'from', member: 'requested by', connected: 'Connected', lost: 'Disconnected, reconnecting…' },
  },
}
