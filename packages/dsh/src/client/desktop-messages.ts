export const DESKTOP_MESSAGES = {
  'zh-CN': {
    currentVersion: (version: string) => `当前版本 ${version}`,
    candidate: (version: string) => `可更新至 ${version}`,
    idle: '检查更新', checking: '正在检查', current: '已是最新版', available: '发现更新',
    downloading: (progress?: number) => progress === undefined ? '正在下载' : `正在下载 ${progress}%`,
    ready: '重启安装', installing: '正在安装', error: '重试更新',
  },
  en: {
    currentVersion: (version: string) => `Current version ${version}`,
    candidate: (version: string) => `Update to ${version}`,
    idle: 'Check for Updates', checking: 'Checking', current: 'Up to Date', available: 'Update Available',
    downloading: (progress?: number) => progress === undefined ? 'Downloading' : `Downloading ${progress}%`,
    ready: 'Restart and Install', installing: 'Installing', error: 'Retry Update',
  },
}
