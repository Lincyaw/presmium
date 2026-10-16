/**
 * UI strings of the remote environments in zh-CN and en (N-07), in the UI
 * language of @presmium/host: `useMessages(MESSAGES)` in components,
 * `messages()` elsewhere (the executor's reasons, the token dialog).
 */
import { currentLocale } from '@presmium/host'
import type { Catalog } from '@presmium/host'

const zhCN = {
  // Why a run or a terminal cannot happen.
  unknown: (name: string) => `文稿没有声明 kind: jupyter 的环境 ${name}`,
  envOnly: (name: string) => `环境 ${name} 的凭据方式是 env，只在构建时可用`,
  hubReserved: (name: string) => `环境 ${name} 的凭据方式 hub 尚未提供`,
  proxyStatic: (name: string) => `环境 ${name} 经 Presmium 服务端的代理连接，静态页面中不可用`,
  noUrl: (name: string) => `环境 ${name} 没有可用的地址 url`,
  noToken: (name: string) => `没有输入环境 ${name} 的令牌`,
  refused: (name: string) => `环境 ${name} 拒绝了令牌，请重新运行并输入令牌`,
  unreachable: (name: string, error: string) => `无法连接环境 ${name}：${error}`,
  noKernel: (name: string, kernel: string, known: string[]) => `环境 ${name} 没有内核 ${kernel}（有：${known.join('、') || '无'}）`,
  wrongLanguage: (name: string, kernel: string, language: string, lang: string) => `环境 ${name} 的内核 ${kernel} 运行 ${language}，不运行 ${lang}`,
  timedOut: (seconds: number) => `运行超过 ${seconds} 秒，已中断内核`,
  // The token dialog (`auth: prompt`).
  tokenTitle: (name: string) => `环境 ${name} 的令牌`,
  tokenHelp: (origin: string) => `粘贴你的 Jupyter 令牌。它只保存在本页的会话存储中（关闭标签页即清除），只发往 ${origin}。`,
  tokenLabel: '令牌',
  tokenConnect: '连接',
  tokenCancel: '取消',
  // The terminal.
  terminal: (name: string) => `环境 ${name} 的终端`,
  terminalOpen: '打开终端',
  terminalConnecting: '正在连接……',
  terminalClosed: '终端已结束',
  terminalReconnect: '重新打开',
  terminalFailed: (reason: string) => `终端无法连接：${reason}`,
}

export type JupyterMessages = typeof zhCN

const en: JupyterMessages = {
  unknown: name => `The deck declares no kind: jupyter environment ${name}`,
  envOnly: name => `Environment ${name} authenticates with env, which works at build time only`,
  hubReserved: name => `Environment ${name} authenticates with hub, which is not available yet`,
  proxyStatic: name => `Environment ${name} connects through the Presmium server's proxy, which a static page does not have`,
  noUrl: name => `Environment ${name} has no usable url`,
  noToken: name => `No token was given for environment ${name}`,
  refused: name => `Environment ${name} refused the token; run again and enter it`,
  unreachable: (name, error) => `Cannot reach environment ${name}: ${error}`,
  noKernel: (name, kernel, known) => `Environment ${name} has no kernel ${kernel} (it has ${known.join(', ') || 'none'})`,
  wrongLanguage: (name, kernel, language, lang) => `The kernel ${kernel} of environment ${name} runs ${language}, not ${lang}`,
  timedOut: seconds => `Ran longer than ${seconds} s; the kernel was interrupted`,
  tokenTitle: name => `Token for environment ${name}`,
  tokenHelp: origin => `Paste your Jupyter token. It stays in this page's session storage (cleared when the tab closes) and goes to ${origin} only.`,
  tokenLabel: 'Token',
  tokenConnect: 'Connect',
  tokenCancel: 'Cancel',
  terminal: name => `Terminal of environment ${name}`,
  terminalOpen: 'Open terminal',
  terminalConnecting: 'Connecting…',
  terminalClosed: 'The terminal ended',
  terminalReconnect: 'Open again',
  terminalFailed: reason => `The terminal cannot connect: ${reason}`,
}

export const MESSAGES: Catalog<JupyterMessages> = { 'zh-CN': zhCN, en }

export function messages(): JupyterMessages {
  return MESSAGES[currentLocale()]
}
