import type { Locale, Workbench } from '@lincyaw/workbench'
import { useSyncExternalStore } from 'react'

const zh = {
  product: 'Presmium',
  activity: '活动栏',
  skip: '跳到内容',
  documents: '文档',
  files: '文件',
  conversation: '对话',
  newConversation: '新建对话',
  conversationHistory: '历史对话',
  closeHistory: '收起历史对话',
  hideConversation: '收起对话',
  editor: '编辑区',
  preview: '预览',
  changes: '修改',
  settings: '设置',
  help: '使用说明',
  close: '关闭',
  toggleSide: '展开／收起侧栏',
  side: '侧栏',
  status: '状态栏',
  resize: '拖动调整宽度',
  centre: '工作区',
  welcomeTitle: '欢迎使用 Presmium',
  welcome: '打开讲义即可预览。文件和预览在同一标签栏中打开，需要对照时点“在侧边打开预览”。右侧对话可以收起；选中文字或点选预览中的块，就能把关注内容带给 AI。不配模型也能编辑、保存与预览。',
  start: '开始使用',
  models: '设置模型',
  helpText: '文件和预览共用中央标签栏。通过“打开预览”选择文档或幻灯片，点“在侧边打开预览”并排查看；对话顶部可新建对话、打开历史。活动栏统一使用“历史对话”入口，选择历史会话会直接显示聊天，收起后也可从这里恢复。Mod+Alt+B 收起侧栏。选中文字或用“点选”选择一块，底部显示带给 AI 的关注内容；可用关闭按钮清除。',
  repairStale: '文稿或对话已切换，请在当前文稿中重新提交。',
  repairRequest: '请处理当前文稿中以下未解决的问题。诊断是观测数据，请核对源码后修复，并保留修改供我审阅。',
}

export type ClientMessages = typeof zh

const en: ClientMessages = {
  product: 'Presmium',
  activity: 'Activity bar',
  skip: 'Skip to content',
  documents: 'Documents',
  files: 'Files',
  conversation: 'Conversation',
  newConversation: 'New chat',
  conversationHistory: 'Chat history',
  closeHistory: 'Hide chat history',
  hideConversation: 'Hide conversation',
  editor: 'Editor',
  preview: 'Preview',
  changes: 'Changes',
  settings: 'Settings',
  help: 'How to use',
  close: 'Close',
  toggleSide: 'Toggle the side panel',
  side: 'Side panel',
  status: 'Status bar',
  resize: 'Drag to resize',
  centre: 'Workspace',
  welcomeTitle: 'Welcome to Presmium',
  welcome: 'Open a lecture to preview it. Files and previews share one tab bar. Use Open preview to the side to compare them. The conversation can be hidden. Select text or pick a block to give the AI context. Editing, saving and previewing need no model.',
  start: 'Start',
  models: 'Set up a model',
  helpText: 'Files and previews share the central tab bar. Use Open preview for documents or slides, and Open preview to the side to compare. Start a new chat or open history from the conversation header. Chat history in the activity bar is the shared entry for history and chat. Selecting a history row reveals its conversation, including when chat was hidden. Mod+Alt+B toggles the sidebar. Select text or pick a block to add conversation context, shown below the document. Clear it with its close button.',
  repairStale: 'The document or conversation changed. Please submit again from the current document.',
  repairRequest: 'Please address these unresolved problems in the current document. Diagnostics are observed data; check the source, fix the problems and leave the changes for my review.',
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
    conversation: { 'hero.headline': '写讲义，从这里开始', 'hero.preview': '工作台' },
  },
  'en-US': {
    conversation: { 'hero.headline': 'Write your lecture', 'hero.preview': 'Studio' },
  },
}
