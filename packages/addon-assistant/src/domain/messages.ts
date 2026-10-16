/**
 * The assistant's words (N-07): the page's by `@presmium/host`
 * (`useMessages`), the approvals the server asks in the deck's language
 * (`deckLocale`).
 */
import type { Locale } from '@presmium/kernel'

const zh = {
  toolbar: { button: '提问', title: '向 AI 助手提问（关于当前一节或选中的内容）' },
  panel: {
    title: '向 AI 提问',
    close: '关闭',
    provider: (provider: string) => `回答由 ${provider} 的模型生成`,
    runtime: (runtime: string) => `运行时：${runtime}`,
    unavailable: '助手不可用：运营者没有配置模型',
    question: '问题',
    placeholder: '想问什么？',
    selection: '附上选中的内容',
    dropSelection: '不附上',
    at: (where: string) => `关于：${where}`,
    ask: '提问',
    cancel: '取消',
    answering: '回答中…',
    tool: (name: string) => `查阅：${name}`,
      failed: (message: string) => `没有得到回答：${message}`,
    answers: '回答',
    cite: (label: string) => `跳到「${label}」`,
  },
  approval: {
    write: (path: string) => `agent 请求写入 ${path}`,
    shell: 'agent 请求运行命令',
    network: 'agent 请求访问网络',
    tool: (name: string) => `agent 请求使用 ${name}`,
  },
  noRuntime: '助手不可用：运营者没有配置模型访问或替换的运行时',
  noChanges: '这里还不能提交修改任务',
}

type Messages = typeof zh

const en: Messages = {
  toolbar: { button: 'Ask', title: 'Ask the AI assistant (about this section or the selection)' },
  panel: {
    title: 'Ask the AI',
    close: 'Close',
    provider: provider => `Answers come from a model of ${provider}`,
    runtime: runtime => `Runtime: ${runtime}`,
    unavailable: 'The assistant is unavailable: the operator configured no model',
    question: 'Question',
    placeholder: 'What would you like to know?',
    selection: 'With the selection',
    dropSelection: 'Leave it out',
    at: where => `About: ${where}`,
    ask: 'Ask',
    cancel: 'Cancel',
    answering: 'Answering…',
    tool: name => `Reading: ${name}`,
      failed: message => `No answer: ${message}`,
    answers: 'Answers',
    cite: label => `Go to “${label}”`,
  },
  approval: {
    write: path => `The agent asks to write ${path}`,
    shell: 'The agent asks to run a command',
    network: 'The agent asks to reach the network',
    tool: name => `The agent asks to use ${name}`,
  },
  noRuntime: 'The assistant is unavailable: the operator configured no model access and no replacement runtime',
  noChanges: 'Change tasks cannot be submitted here yet',
}

export type AssistantMessages = Messages

export const ASSISTANT_MESSAGES: Record<Locale, AssistantMessages> = { 'zh-CN': zh, 'en': en }
