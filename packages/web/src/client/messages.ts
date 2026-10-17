import type { Locale } from '@presmium/kernel/contracts'

/**
 * What the served shell says besides WEB_MESSAGES (N-07): edit mode's top bar
 * (docs/design/edit.dc.html), the launcher's search over documents, sections
 * and commands, and the skip link of the workbench.
 */
export interface ShellMessages {
  /** Edit mode's top bar, its trail (workspace / document), the preview's views and the slides. */
  editBar: string
  trail: string
  previewView: string
  documentView: string
  presentView: string
  slides: string
  /** The launcher's search: its box, its results and their groups. */
  searchAll: string
  results: string
  groupDocuments: string
  groupSections: string
  groupCommands: string
  noResults: string
  /** The commands the shell itself has. */
  toggleTheme: string
  skipToContent: string
}

export const SHELL_MESSAGES: Record<Locale, ShellMessages> = {
  'zh-CN': {
    editBar: '编辑',
    trail: '位置',
    previewView: '预览视图',
    documentView: '文档',
    presentView: '放映',
    slides: '幻灯片',
    searchAll: '搜索文档、章节与命令',
    results: '搜索结果',
    groupDocuments: '文档',
    groupSections: '章节',
    groupCommands: '命令',
    noResults: '没有找到',
    toggleTheme: '切换明暗',
    skipToContent: '跳到内容',
  },
  'en': {
    editBar: 'Edit',
    trail: 'Location',
    previewView: 'Preview',
    documentView: 'Document',
    presentView: 'Present',
    slides: 'Slides',
    searchAll: 'Search documents, sections and commands',
    results: 'Results',
    groupDocuments: 'Documents',
    groupSections: 'Sections',
    groupCommands: 'Commands',
    noResults: 'Nothing found',
    toggleTheme: 'Switch light and dark',
    skipToContent: 'Skip to content',
  },
}
