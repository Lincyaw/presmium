export type Locale = 'zh-CN' | 'en'

export type LaunchError = 'not-directory' | 'start-failed' | 'start-timeout' | 'studio-ended'

export interface LauncherMessages {
  lead: string
  open: string
  recent: string
  remove: string
  starting(name: string): string
  details: string
  errors: Record<LaunchError, string>
}

export const LAUNCHER_MESSAGES: Record<Locale, LauncherMessages> = {
  'zh-CN': {
    lead: '打开一个工作区，开始编辑其中的文稿。',
    open: '打开工作区…',
    recent: '最近打开',
    remove: '从最近打开中移除',
    starting: name => `正在打开 ${name}…`,
    details: '详细信息',
    errors: {
      'not-directory': '这个文件夹不存在或无法打开。',
      'start-failed': 'Presmium Studio 未能启动。',
      'start-timeout': 'Presmium Studio 启动时间过长，已停止。',
      'studio-ended': 'Presmium Studio 意外停止了。',
    },
  },
  en: {
    lead: 'Open a workspace to edit its documents.',
    open: 'Open Workspace…',
    recent: 'Recent',
    remove: 'Remove from Recent',
    starting: name => `Opening ${name}…`,
    details: 'Details',
    errors: {
      'not-directory': 'This folder does not exist or cannot be opened.',
      'start-failed': 'Presmium Studio could not start.',
      'start-timeout': 'Presmium Studio took too long to start and was stopped.',
      'studio-ended': 'Presmium Studio stopped unexpectedly.',
    },
  },
}

