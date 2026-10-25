import type { Locale } from '@lincyaw/kernel/contracts'

const zhStep = (step: number, steps: number) => `第 ${step + 1} 步，共 ${steps + 1} 步`

const zh = {
  contentRoles: { visual: '上屏内容', narration: '讲解 · 字幕', reading: '仅供阅读' },
  views: { document: '文档', scrolly: '滚动叙事', present: '放映', presenter: '演讲者' },
  present: {
    region: '放映',
    jumpStep: '跳转步骤',
    step: (step: number) => `第 ${step} 步`,
    counter: (index: number, total: number, step: number, steps: number) => `${index} / ${total}${steps > 0 ? ` · ${zhStep(step, steps)}` : ''}`,
    prev: '上一步',
    next: '下一步',
    overview: '总览',
    presenter: '演讲者窗口',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    exit: '退出放映',
  },
  presenter: {
    step: (step: number, steps: number) => (steps > 0 ? zhStep(step, steps) : ''),
    timer: '计时',
    restart: '重新计时',
    notes: '讲解',
    noNotes: '本节没有讲解',
    upcoming: '下一步',
    end: '已到结尾',
    nextSection: (title: string) => `下一节：${title}`,
    nextStep: (step: number) => `第 ${step + 1} 步`,
  },
  section: {
    anchor: (title: string) => `链接到“${title}”`,
    openSource: '在编辑器中打开源码',
    sourceTitle: (where: string) => `${where}（Alt+单击任一块，打开该块的源码）`,
  },
  code: {
    executorFailed: (id: string, message: string) => `执行器 ${id} 出错：${message}`,
    run: '运行',
    rerun: '重跑',
    running: '运行中…',
    unavailable: '执行服务不可用',
    resetRunSession: '重置会话',
    edit: '编辑代码',
    doneEditing: '完成编辑',
    revert: '还原代码',
  },
  markdown: {
    admonitions: {
      note: '注意',
      tip: '提示',
      hint: '提示',
      important: '重要',
      warning: '警告',
      caution: '小心',
      attention: '注意',
      danger: '危险',
      error: '错误',
      seealso: '另请参阅',
    } as Record<string, string>,
    footnote: (label: string) => `脚注 ${label}`,
  },
  missingComponent: (name: string) => `未注册的组件 ${name}`,
}

export type Messages = typeof zh

const en: Messages = {
  contentRoles: { visual: 'On screen', narration: 'Narration · Captions', reading: 'Reading only' },
  views: { document: 'Document', scrolly: 'Scrollytelling', present: 'Present', presenter: 'Presenter' },
  present: {
    region: 'Presentation',
    jumpStep: 'Jump to step',
    step: step => `Step ${step}`,
    counter: (index, total, step, steps) => `${index} / ${total}${steps > 0 ? ` · step ${step + 1} of ${steps + 1}` : ''}`,
    prev: 'Previous',
    next: 'Next',
    overview: 'Overview',
    presenter: 'Presenter window',
    fullscreen: 'Full screen',
    exitFullscreen: 'Exit full screen',
    exit: 'Exit presentation',
  },
  presenter: {
    step: (step, steps) => (steps > 0 ? `Step ${step + 1} of ${steps + 1}` : ''),
    timer: 'Timer',
    restart: 'Restart timer',
    notes: 'Narration',
    noNotes: 'No narration in this section',
    upcoming: 'Next',
    end: 'End of the document',
    nextSection: title => `Next section: ${title}`,
    nextStep: step => `Step ${step + 1}`,
  },
  section: {
    anchor: title => `Link to "${title}"`,
    openSource: 'Open the source in the editor',
    sourceTitle: where => `${where} (Alt+click a block to open its source)`,
  },
  code: {
    executorFailed: (id, message) => `Executor ${id} failed: ${message}`,
    run: 'Run',
    rerun: 'Run again',
    running: 'Running…',
    unavailable: 'Execution service unavailable',
    resetRunSession: 'Reset session',
    edit: 'Edit the code',
    doneEditing: 'Done editing',
    revert: 'Restore the code',
  },
  markdown: {
    admonitions: {
      note: 'Note',
      tip: 'Tip',
      hint: 'Hint',
      important: 'Important',
      warning: 'Warning',
      caution: 'Caution',
      attention: 'Attention',
      danger: 'Danger',
      error: 'Error',
      seealso: 'See also',
    },
    footnote: label => `Footnote ${label}`,
  },
  missingComponent: name => `Unregistered component ${name}`,
}

export const VIEWER_MESSAGES: Record<Locale, Messages> = { 'zh-CN': zh, 'en': en }
