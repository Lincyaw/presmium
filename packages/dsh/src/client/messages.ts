import type { Locale } from '@presmium/workbench'

const zh = {
  product: 'Presmium',
  activity: '活动栏',
  skip: '跳到内容',
  documents: '文档',
  files: '文件',
  sessions: '会话',
  conversation: '对话',
  source: '源码',
  preview: '预览',
  settings: '设置',
  help: '使用说明',
  close: '关闭',
  toggleSide: '展开／收起侧栏',
  dark: '切换明暗',
  side: '侧栏',
  status: '状态栏',
  resize: '拖动调整宽度',
  centre: '工作区',
  welcomeTitle: '欢迎使用 Presmium',
  welcome: '在这里编写讲义：左边是文件与源码，右边是实时预览，对话停靠在最右。不配模型也能编辑、保存与预览；要请 AI 修改，先在设置中配置模型。',
  start: '开始使用',
  models: '设置模型',
  helpText: '活动栏的“文档”回到文档列表，“文件”是文档的文件树，“会话”是与 AI 的会话；Mod+Alt+B 展开或收起侧栏。在预览中按“点选”再点一块，编辑器到它的行。',
}

export type FrameMessages = typeof zh

const en: FrameMessages = {
  product: 'Presmium',
  activity: 'Activity bar',
  skip: 'Skip to content',
  documents: 'Documents',
  files: 'Files',
  sessions: 'Sessions',
  conversation: 'Conversation',
  source: 'Source',
  preview: 'Preview',
  settings: 'Settings',
  help: 'How to use',
  close: 'Close',
  toggleSide: 'Toggle the side panel',
  dark: 'Toggle light and dark',
  side: 'Side panel',
  status: 'Status bar',
  resize: 'Drag to resize',
  centre: 'Workspace',
  welcomeTitle: 'Welcome to Presmium',
  welcome: 'Write your lectures here: the files and the source on the left, the live preview on the right, the conversation docked at the far right. Editing, saving and the preview need no model; to ask the AI for changes, set up a model in Settings first.',
  start: 'Start',
  models: 'Set up a model',
  helpText: '“Documents” in the activity bar goes back to the documents, “Files” is the document’s file tree, “Sessions” are the conversations with the AI; Mod+Alt+B toggles the side panel. In the preview, press “Pick” and click a block to go to its lines.',
}

export const FRAME_MESSAGES: Record<Locale, FrameMessages> = { 'zh-CN': zh, 'en': en }

export const BRAND_COPY: Record<'zh-CN' | 'en-US', Record<string, Record<string, string>>> = {
  'zh-CN': {
    conversation: { 'hero.headline': '写讲义，从这里开始', 'hero.preview': '工作台' },
  },
  'en-US': {
    conversation: { 'hero.headline': 'Write your lecture', 'hero.preview': 'Studio' },
  },
}
