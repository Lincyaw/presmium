/**
 * The IR runtime's interface text (N-07), in Chinese and English. The
 * language is the page's (`<html lang>`), else the browser's; any language
 * other than Chinese gets English.
 */
const zh = {
  views: { document: '文档', scrolly: '滚动叙事', present: '放映', presenter: '演讲者' },
  present: {
    region: '放映',
    counter: (index: number, total: number, step: number, steps: number) => `${index} / ${total} · 第 ${step} 步，共 ${steps} 步`,
    prev: '上一步',
    next: '下一步',
    overview: '总览',
    presenter: '演讲者窗口',
    fullscreen: '全屏',
    exit: '退出放映',
  },
  presenter: {
    step: (step: number, steps: number) => `第 ${step} 步，共 ${steps} 步`,
    timer: '计时',
    restart: '重新计时',
    notes: '讲解',
    noNotes: '本节没有讲解',
    upcoming: '下一步',
    end: '已到结尾',
    nextSection: (title: string) => `下一节：${title}`,
    nextStep: (step: number) => `第 ${step} 步`,
  },
  section: {
    anchor: (title: string) => `链接到“${title}”`,
    openSource: '在编辑器中打开源码',
    sourceTitle: (where: string) => `${where}（Alt+单击任一块，打开该块的源码）`,
    nav: '章节导航',
    prev: '上一节',
    next: '下一节',
  },
  code: {
    status: { moved: '已移动', fuzzy: '待确认', lost: '已失效' } as Record<string, string>,
    workingTree: '工作区',
    drifted: '已漂移',
    driftedTitle: '工作区中的代码已改变，运行 presmium check 查看差异',
    synced: '已锁定',
    syncedTitle: '锁定的代码与工作区一致',
    openFile: (file: string) => `在仓库中打开 ${file}`,
    timedOut: '超时',
    exitCode: (code: number) => `退出码 ${code}`,
    recorded: '预录输出',
    executorFailed: (id: string, message: string) => `执行器 ${id} 出错：${message}`,
    run: '运行',
    rerun: '重跑',
    running: '运行中…',
    unavailable: '执行服务不可用',
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
    counter: (index, total, step, steps) => `${index} / ${total} · step ${step} of ${steps}`,
    prev: 'Previous',
    next: 'Next',
    overview: 'Overview',
    presenter: 'Presenter window',
    fullscreen: 'Full screen',
    exit: 'Exit presentation',
  },
  presenter: {
    step: (step, steps) => `Step ${step} of ${steps}`,
    timer: 'Timer',
    restart: 'Restart timer',
    notes: 'Narration',
    noNotes: 'No narration in this section',
    upcoming: 'Next',
    end: 'End of the document',
    nextSection: title => `Next section: ${title}`,
    nextStep: step => `Step ${step}`,
  },
  section: {
    anchor: title => `Link to "${title}"`,
    openSource: 'Open the source in the editor',
    sourceTitle: where => `${where} (Alt+click a block to open its source)`,
    nav: 'Section navigation',
    prev: 'Previous section',
    next: 'Next section',
  },
  code: {
    status: { moved: 'Moved', fuzzy: 'Unconfirmed', lost: 'Lost' },
    workingTree: 'working tree',
    drifted: 'Drifted',
    driftedTitle: 'The code changed in the working tree; run presmium check to see the difference',
    synced: 'Pinned',
    syncedTitle: 'The pinned code matches the working tree',
    openFile: file => `Open ${file} in the repository`,
    timedOut: 'Timed out',
    exitCode: code => `Exit code ${code}`,
    recorded: 'Recorded output',
    executorFailed: (id, message) => `Executor ${id} failed: ${message}`,
    run: 'Run',
    rerun: 'Run again',
    running: 'Running…',
    unavailable: 'Execution service unavailable',
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

export type Locale = 'zh-CN' | 'en'

/** The catalog for a language tag such as `zh-CN` or `en-US`; Chinese when none is given. */
export function localeOf(lang: string | undefined): Locale {
  return !lang || /^zh\b/i.test(lang) ? 'zh-CN' : 'en'
}

export function messagesFor(locale: Locale): Messages {
  return locale === 'en' ? en : zh
}
