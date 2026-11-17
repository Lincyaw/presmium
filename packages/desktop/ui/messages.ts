export type Locale = 'zh-CN' | 'en'

export type LaunchError = 'not-directory' | 'start-failed' | 'start-timeout' | 'studio-ended' | 'examples-failed'

export interface LauncherMessages {
  lead: string
  open: string
  recent: string
  remove: string
  starting(name: string): string
  details: string
  updates: {
    version(version: string): string
    idle: string, checking: string, current: string, available: string,
    downloading(progress?: number): string
    ready: string, installing: string, error: string
  }
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
    updates: {
      version: version => `当前版本 ${version}`,
      idle: '检查更新', checking: '正在检查', current: '已是最新版', available: '发现更新',
      downloading: progress => progress === undefined ? '正在下载' : `正在下载 ${progress}%`,
      ready: '重启安装', installing: '正在安装', error: '重试更新',
    },
    errors: {
      'not-directory': '这个文件夹不存在或无法打开。',
      'start-failed': 'Presmium Studio 未能启动。',
      'start-timeout': 'Presmium Studio 启动时间过长，已停止。',
      'studio-ended': 'Presmium Studio 意外停止了。',
      'examples-failed': '示例工作区未能准备好。请查看详细信息，或打开其他工作区。',
    },
  },
  en: {
    lead: 'Open a workspace to edit its documents.',
    open: 'Open Workspace…',
    recent: 'Recent',
    remove: 'Remove from Recent',
    starting: name => `Opening ${name}…`,
    details: 'Details',
    updates: {
      version: version => `Current version ${version}`,
      idle: 'Check for Updates', checking: 'Checking', current: 'Up to Date', available: 'Update Available',
      downloading: progress => progress === undefined ? 'Downloading' : `Downloading ${progress}%`,
      ready: 'Restart and Install', installing: 'Installing', error: 'Retry Update',
    },
    errors: {
      'not-directory': 'This folder does not exist or cannot be opened.',
      'start-failed': 'Presmium Studio could not start.',
      'start-timeout': 'Presmium Studio took too long to start and was stopped.',
      'studio-ended': 'Presmium Studio stopped unexpectedly.',
      'examples-failed': 'The example workspace could not be prepared. View the details or open another workspace.',
    },
  },
}

