import { currentLocale } from '@lincyaw/host'
import type { Catalog } from '@lincyaw/host'

const zhCN = {
  unknown: (name: string) => `文稿没有声明 kind: jupyter 的环境 ${name}`,
  envOnly: (name: string) => `环境 ${name} 的凭据方式是 env，只在导出时可用`,
  hubReserved: (name: string) => `环境 ${name} 的凭据方式 hub 尚未提供`,
  proxyStatic: (name: string) => `环境 ${name} 经 Presmium 服务端的代理连接，静态页面中不可用`,
  noUrl: (name: string) => `环境 ${name} 没有可用的地址 url`,
  noToken: (name: string) => `没有输入环境 ${name} 的密钥`,
  refused: (name: string) => `环境 ${name} 拒绝了密钥。请重新运行并输入密钥。`,
  unreachable: (name: string, error: string) => `无法连接环境 ${name}：${error}`,
  noKernel: (name: string, kernel: string, known: string[]) => `环境 ${name} 中没有 ${kernel}（可用：${known.join('、') || '无'}）`,
  wrongLanguage: (name: string, kernel: string, language: string, lang: string) => `环境 ${name} 中的 ${kernel} 运行 ${language}，不是 ${lang}`,
  timedOut: (seconds: number) => `运行超过 ${seconds} 秒，已中断`,
  tokenTitle: (name: string) => `环境 ${name} 的密钥`,
  tokenHelp: (origin: string) => `粘贴你的 Jupyter 服务器的密钥。它只保存在本页的会话存储中（关闭标签页即清除），只发往 ${origin}。`,
  tokenLabel: '密钥',
  tokenConnect: '连接',
  tokenCancel: '取消',
  terminal: (name: string) => `环境 ${name} 的终端`,
  terminalOpen: '打开终端',
  terminalConnecting: '正在连接…',
  terminalClosed: '终端已结束',
  terminalReconnect: '重新打开',
  terminalFailed: (reason: string) => `无法连接终端：${reason}`,
}

export type JupyterMessages = typeof zhCN

const en: JupyterMessages = {
  unknown: name => `The document declares no kind: jupyter environment ${name}`,
  envOnly: name => `Environment ${name} authenticates with env, which works only when exporting`,
  hubReserved: name => `Environment ${name} authenticates with hub, which is not available yet`,
  proxyStatic: name => `Environment ${name} connects through the Presmium server’s proxy, which a static page does not have`,
  noUrl: name => `Environment ${name} has no usable url`,
  noToken: name => `No API key was given for environment ${name}`,
  refused: name => `Environment ${name} refused the API key. Run again and enter it.`,
  unreachable: (name, error) => `Couldn’t reach environment ${name}: ${error}`,
  noKernel: (name, kernel, known) => `Environment ${name} has no ${kernel} (available: ${known.join(', ') || 'none'})`,
  wrongLanguage: (name, kernel, language, lang) => `${kernel} in environment ${name} runs ${language}, not ${lang}`,
  timedOut: seconds => `Ran longer than ${seconds} s and was interrupted`,
  tokenTitle: name => `API Key for Environment ${name}`,
  tokenHelp: origin => `Paste the API key of your Jupyter server. It stays in this page’s session storage (cleared when the tab closes) and goes to ${origin} only.`,
  tokenLabel: 'API key',
  tokenConnect: 'Connect',
  tokenCancel: 'Cancel',
  terminal: name => `Terminal of environment ${name}`,
  terminalOpen: 'Open Terminal',
  terminalConnecting: 'Connecting…',
  terminalClosed: 'The terminal ended',
  terminalReconnect: 'Open Again',
  terminalFailed: reason => `Couldn’t connect the terminal: ${reason}`,
}

export const MESSAGES: Catalog<JupyterMessages> = { 'zh-CN': zhCN, en }

export function messages(): JupyterMessages {
  return MESSAGES[currentLocale()]
}
