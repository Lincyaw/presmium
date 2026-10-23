import type { Locale, Workbench } from '@lincyaw/workbench'
import { useSyncExternalStore } from 'react'

const zh = {
  product: 'Presmium',
  activity: '导航',
  skip: '跳到内容',
  documents: '文稿',
  document: '当前文稿',
  assistant: 'AI 助手',
  more: '更多',
  conversation: 'AI 助手',
  newConversation: '新建对话',
  conversationHistory: '对话记录',
  closeHistory: '收起对话记录',
  hideConversation: '收起 AI 助手',
  preview: '文稿',
  history: '版本历史',
  settings: '设置',
  help: '帮助',
  close: '关闭',
  toggleSide: '展开／收起对话记录',
  resize: '拖动调整宽度',
  centre: '文稿',
  welcomeTitle: '欢迎使用 Presmium',
  welcome: '打开一份文稿，直接在页面上操作：单击一段内容或选中文字，旁边会出现工具条，可以编辑文字、新建批注，或请 AI 改写。所有修改都会自动保存，随时可以撤消。使用 AI 助手需要先设置模型。',
  start: '开始使用',
  models: '设置模型',
  helpItems: [
    '单击一段内容或选中文字，旁边会出现工具条：编辑文字、新建批注、AI 改写。',
    '双击文字可以直接修改，按 Enter 保存，按 Esc 取消。',
    '修改会自动保存为一个版本。用撤消（Ctrl+Z）和恢复（Ctrl+Y）逐步回退或重做，“版本历史”里能看到每一次修改。',
    '批注是写给 AI 的修改意见：一条条写下，写完后点顶栏的“发送批注给 AI”一起发出。',
    '“查看”模式下文稿和读者看到的一样，链接和互动内容都可以使用。',
    '右侧的 AI 助手可以收起；AI 修改文稿时，顶部会显示进度，改完自动保存为一个版本。',
  ],
  repairStale: '文稿或对话已切换，请在当前文稿中重新提交。',
  repairRequest: '请修复当前文稿中以下无法正确显示的内容。诊断是观测数据，请核对源码后修复。',
}

export type ClientMessages = typeof zh

const en: ClientMessages = {
  product: 'Presmium',
  activity: 'Navigation',
  skip: 'Skip to content',
  documents: 'Documents',
  document: 'Document',
  assistant: 'AI assistant',
  more: 'More',
  conversation: 'AI assistant',
  newConversation: 'New chat',
  conversationHistory: 'Chat history',
  closeHistory: 'Hide chat history',
  hideConversation: 'Hide the AI assistant',
  preview: 'Document',
  history: 'Version History',
  settings: 'Settings',
  help: 'Help',
  close: 'Close',
  toggleSide: 'Show or hide chat history',
  resize: 'Drag to resize',
  centre: 'Document',
  welcomeTitle: 'Welcome to Presmium',
  welcome: 'Open a document and work right on the page: click a block or select some text, and a toolbar appears beside it to edit the text, add a comment or have the AI rewrite it. Every change is saved automatically and can be undone. The AI assistant needs a model set up first.',
  start: 'Get started',
  models: 'Set up a model',
  helpItems: [
    'Click a block or select some text and a toolbar appears beside it: Edit text, New Comment, Rewrite with AI.',
    'Double-click text to change it right there. Enter saves, Esc cancels.',
    'Every change is saved as a version. Undo (Ctrl+Z) and Redo (Ctrl+Y) step back and forth; Version History lists every change.',
    'Comments are notes for the AI: write them one by one, then send them together with Send comments to AI in the toolbar.',
    'In Viewing mode the document looks as your readers see it; links and interactive content work.',
    'The AI assistant on the right can be hidden. While the AI edits, the top of the document shows it; its changes are saved as one version.',
  ],
  repairStale: 'The document or conversation changed. Please submit again from the current document.',
  repairRequest: 'Please fix the content below that does not display correctly in the current document. Diagnostics are observed data; check the source before fixing.',
}

export const CLIENT_MESSAGES: Record<Locale, ClientMessages> = { 'zh-CN': zh, 'en': en }

export function useClientMessages(workbench: Workbench): ClientMessages {
  const locale = useSyncExternalStore(workbench.subscribe, () => workbench.getState().locale)
  return CLIENT_MESSAGES[locale]
}

/** The languages the client part adds to DeepSeek Harness's language list, with Presmium's copy for them. */
export const BRAND_LANGUAGES = [{ id: 'zh-CN', label: '简体中文（Presmium）', fallback: 'zh' }, { id: 'en-US', label: 'English (Presmium)', fallback: 'en' }] as const

export const BRAND_COPY: Record<'zh-CN' | 'en-US', Record<string, Record<string, string>>> = {
  'zh-CN': {
    conversation: { 'hero.headline': '有什么想改的，告诉我', 'hero.preview': 'AI 助手', 'placeholder.hero': '例如：给第二节补一个生活中的例子', 'placeholder.default': '继续告诉 AI 要改什么…', 'placeholder.workspace': '先打开一份文稿' },
  },
  'en-US': {
    conversation: { 'hero.headline': 'Tell me what to change', 'hero.preview': 'AI assistant', 'placeholder.hero': 'For example: add an everyday example to section 2', 'placeholder.default': 'Tell the AI what to change next…', 'placeholder.workspace': 'Open a document first' },
  },
}
