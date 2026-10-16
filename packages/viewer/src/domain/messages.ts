/**
 * The IR runtime's interface text (N-07), in Chinese and English, as a
 * catalog of @presmium/host (`useMessages`, `currentLocale`).
 */
import type { Locale } from '@presmium/kernel/contracts'

/** `第 k 步，共 n 步` of a section with steps; steps count from 1 for the reader. */
const zhStep = (step: number, steps: number) => `第 ${step + 1} 步，共 ${steps + 1} 步`

const zh = {
  views: { document: '文档', scrolly: '滚动叙事', present: '放映', presenter: '演讲者' },
  present: {
    region: '放映',
    /** Section `index` of `total`, then the step when the section has steps (0-based `step`, last step `steps`). */
    counter: (index: number, total: number, step: number, steps: number) => `${index} / ${total}${steps > 0 ? ` · ${zhStep(step, steps)}` : ''}`,
    prev: '上一步',
    next: '下一步',
    overview: '总览',
    presenter: '演讲者窗口',
    fullscreen: '全屏',
    exit: '退出放映',
  },
  presenter: {
    /** The step when the section has steps; empty otherwise. */
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
    resetSession: '重置会话',
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
  views: { document: 'Document', scrolly: 'Scrollytelling', present: 'Present', presenter: 'Presenter' },
  present: {
    region: 'Presentation',
    counter: (index, total, step, steps) => `${index} / ${total}${steps > 0 ? ` · step ${step + 1} of ${steps + 1}` : ''}`,
    prev: 'Previous',
    next: 'Next',
    overview: 'Overview',
    presenter: 'Presenter window',
    fullscreen: 'Full screen',
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
    resetSession: 'Reset session',
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

/** The IR runtime's text in each UI language. */
export const VIEWER_MESSAGES: Record<Locale, Messages> = { 'zh-CN': zh, 'en': en }
