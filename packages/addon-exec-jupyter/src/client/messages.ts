import { currentLocale } from '@lincyaw/host'
import type { Catalog } from '@lincyaw/host'

const zhCN = {
  unknown: (name: string) => `文稿没有声明 kind: jupyter 的环境 ${name}`,
  envOnly: (name: string) => `环境 ${name} 的凭据方式是 env，只在导出时可用`,
  hubReserved: (name: string) => `环境 ${name} 的凭据方式 hub 尚未提供`,
  proxyStatic: (name: string) => `环境 ${name} 经 Presmium 服务端的代理连接，静态页面中不可用`,
  noUrl: (name: string) => `环境 ${name} 没有可用的地址 url`,
  noToken: (name: string) => `没有输入环境 ${name} 的访问令牌`,
  refused: (name: string) => `环境 ${name} 拒绝了访问令牌。请重新运行并输入访问令牌。`,
  unreachable: (name: string, reason: string) => `无法连接环境 ${name}。${reason}`,
  reasons: {
    'jupyter-no-answer': 'Jupyter 服务在 10 秒内没有响应，请稍后重新运行。',
    'jupyter-closed': '与 Jupyter 服务的连接已断开，请重新运行。',
    network: '无法连接 Jupyter 服务，请检查网络与服务地址后重新运行。',
  } as Record<string, string>,
  noKernel: (name: string, kernel: string, known: string[]) => `环境 ${name} 中没有 ${kernel}（可用：${known.join('、') || '无'}）`,
  wrongLanguage: (name: string, kernel: string, language: string, lang: string) => `环境 ${name} 中的 ${kernel} 运行 ${language}，不是 ${lang}`,
  timedOut: (seconds: number) => `运行超过 ${seconds} 秒，已中断`,
  tokenTitle: (name: string) => `环境 ${name} 的访问令牌`,
  tokenHelp: (origin: string) => `粘贴你的 Jupyter 服务器的访问令牌。它只保存在本页的会话存储中（关闭标签页即清除），只发往 ${origin}。`,
  tokenLabel: '访问令牌',
  tokenConnect: '连接',
  tokenCancel: '取消',
  terminal: (name: string) => `环境 ${name} 的终端`,
  terminalOpen: '打开终端',
  terminalConnecting: '正在连接…',
  terminalClosed: '终端已结束',
  terminalReconnect: '重新打开',
  terminalFailed: (reason: string) => `无法连接终端。${reason}`,
}

export type JupyterMessages = typeof zhCN

const en: JupyterMessages = {
  unknown: name => `The document declares no kind: jupyter environment ${name}`,
  envOnly: name => `Environment ${name} authenticates with env, which works only when exporting`,
  hubReserved: name => `Environment ${name} authenticates with hub, which is not available yet`,
  proxyStatic: name => `Environment ${name} connects through the Presmium server’s proxy, which a static page does not have`,
  noUrl: name => `Environment ${name} has no usable url`,
  noToken: name => `No access token was given for environment ${name}`,
  refused: name => `Environment ${name} refused the access token. Run again and enter it.`,
  unreachable: (name, reason) => `Couldn’t reach environment ${name}. ${reason}`,
  reasons: {
    'jupyter-no-answer': 'The Jupyter service didn’t answer within 10 seconds. Run again shortly.',
    'jupyter-closed': 'The connection to the Jupyter service closed. Run again.',
    network: 'Couldn’t reach the Jupyter service. Check the network and the service address, then run again.',
  },
  noKernel: (name, kernel, known) => `Environment ${name} has no ${kernel} (available: ${known.join(', ') || 'none'})`,
  wrongLanguage: (name, kernel, language, lang) => `${kernel} in environment ${name} runs ${language}, not ${lang}`,
  timedOut: seconds => `Ran longer than ${seconds} s and was interrupted`,
  tokenTitle: name => `Access Token for Environment ${name}`,
  tokenHelp: origin => `Paste the access token of your Jupyter server. It stays in this page’s session storage (cleared when the tab closes) and goes to ${origin} only.`,
  tokenLabel: 'Access token',
  tokenConnect: 'Connect',
  tokenCancel: 'Cancel',
  terminal: name => `Terminal of environment ${name}`,
  terminalOpen: 'Open Terminal',
  terminalConnecting: 'Connecting…',
  terminalClosed: 'The terminal ended',
  terminalReconnect: 'Open Again',
  terminalFailed: reason => `Couldn’t connect the terminal. ${reason}`,
}

export const MESSAGES: Catalog<JupyterMessages> = { 'zh-CN': zhCN, en }

export function messages(): JupyterMessages {
  return MESSAGES[currentLocale()]
}

/** A reader's sentence for why Jupyter could not be reached; the failure's own words go to the console only. */
export function failureText(error: string, code?: string): string {
  const t = messages()
  if (code && code in t.reasons) return t.reasons[code]!
  console.warn(`presmium: Jupyter: ${error}`)
  return t.reasons.network!
}
