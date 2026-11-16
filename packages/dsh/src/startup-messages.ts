const zh = {
  opening: '正在打开工作区…',
  failed: '无法打开工作区。可以重试，或查看详细信息。',
  slow: '打开工作区所需时间较长，你可以继续等待或重试。',
  retry: '重试', details: '详细信息',
}
export const STARTUP_MESSAGES = {
  'zh-CN': zh,
  en: {
    opening: 'Opening your workspace…',
    failed: 'The workspace could not open. Retry or view details.',
    slow: 'Opening the workspace is taking longer than usual. You can keep waiting or retry.',
    retry: 'Retry', details: 'Details',
  } satisfies typeof zh,
}
