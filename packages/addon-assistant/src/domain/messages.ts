import type { Locale } from '@lincyaw/kernel'

const zh = {
  toolbar: { button: '提问', title: '向 AI 提问（关于当前页面或所选内容），使用你自己的模型服务' },
  panel: {
    title: '向 AI 提问',
    close: '关闭',
    provider: (provider: string, model: string) => `回答由 ${provider} 的模型 ${model} 生成`,
    service: '模型服务',
    question: '问题',
    placeholder: '想问什么？',
    selection: '附上所选内容',
    dropSelection: '不附上',
    at: (where: string) => `关于：${where}`,
    ask: '提问',
    cancel: '取消',
    cancelled: '已取消',
    answering: '正在回答…',
    failed: (message: string) => `无法获得回答：${message}`,
    answers: '回答',
    cite: (label: string) => `跳到“${label}”`,
  },
  ask: {
    title: '你的模型服务',
    intro: '提问由你自己填写的模型服务回答：OpenAI 兼容的 Chat Completions 接口的地址、密钥与模型名。问题与当前页面的内容从这个浏览器直接发给该服务，不经过本站；费用由该服务向你收取。',
    storage: '设置只保存在这个浏览器中（本站点的存储）。同一站点上的脚本能读到密钥，请只在你信任的站点上填写。',
    url: '地址',
    urlPlaceholder: 'https://api.deepseek.com/v1',
    key: '密钥',
    model: '模型名',
    modelPlaceholder: 'deepseek-chat',
    save: '保存',
    cancel: '取消',
    clear: '清除设置',
    invalidUrl: '地址须以 https:// 或 http:// 开头。',
    missing: '尚未设置模型服务。',
  },
}

type Messages = typeof zh

const en: Messages = {
  toolbar: { button: 'Ask', title: 'Ask the AI about this page or the selection, using your own model service' },
  panel: {
    title: 'Ask the AI',
    close: 'Close',
    provider: (provider, model) => `Answers come from ${provider}’s model ${model}`,
    service: 'Model service',
    question: 'Question',
    placeholder: 'What would you like to know?',
    selection: 'Include the selection',
    dropSelection: 'Don’t Include',
    at: where => `About: ${where}`,
    ask: 'Ask',
    cancel: 'Cancel',
    cancelled: 'Canceled',
    answering: 'Answering…',
    failed: message => `Couldn’t get an answer: ${message}`,
    answers: 'Answers',
    cite: label => `Go to “${label}”`,
  },
  ask: {
    title: 'Your Model Service',
    intro: 'Your own model service answers: the address, key, and model of an OpenAI-compatible Chat Completions API. The question and this page’s content go from this browser to that service directly, not through this site; the service bills you.',
    storage: 'The settings stay in this browser (this site’s storage). Scripts on the same site can read the key, so fill it in only on sites you trust.',
    url: 'Address',
    urlPlaceholder: 'https://api.deepseek.com/v1',
    key: 'API key',
    model: 'Model',
    modelPlaceholder: 'deepseek-chat',
    save: 'Save',
    cancel: 'Cancel',
    clear: 'Clear Settings',
    invalidUrl: 'The address must start with https:// or http://.',
    missing: 'No model service is set up yet.',
  },
}

export type AssistantMessages = Messages

export const ASSISTANT_MESSAGES: Record<Locale, AssistantMessages> = { 'zh-CN': zh, 'en': en }
