import { currentLocale } from '@lincyaw/host'
import type { Catalog } from '@lincyaw/host'

const zhCN = {
  unknown: (name: string) => `文稿没有声明 kind: jupyter 的环境 ${name}`,
  envOnly: (name: string) => `环境 ${name} 的凭据方式是 env，只在导出时可用`,
  cancelled: '已取消运行环境连接',
  proxyStatic: (name: string) => `环境 ${name} 经 Presmium 服务端的代理连接，静态页面中不可用`,
  noUrl: (name: string) => `环境 ${name} 没有可用的地址 url`,
  noToken: (name: string) => `没有输入环境 ${name} 的访问令牌`,
  refused: (name: string) => `环境 ${name} 拒绝了访问令牌。请重新运行并输入访问令牌。`,
  unreachable: (name: string, reason: string) => `无法连接环境 ${name}。${reason}`,
  reasons: {
    'jupyter-no-answer': 'Jupyter 服务在 10 秒内没有响应，请稍后重新运行。',
    'jupyter-closed': '与 Jupyter 服务的连接已断开，请重新运行。',
    network: '无法连接 Jupyter 服务，请检查网络与服务地址后重新运行。',
    'hub-not-configured': '此服务尚未配置 JupyterHub 环境。请联系运营者配置后重试。',
    'hub-profile-unavailable': '此环境规格不可用。请在文稿中选择运营者提供的 profile 后重试。',
    'hub-start-failed': '运行环境启动失败。请稍后重试，或联系运营者查看启动诊断。',
    'hub-start-timeout': '运行环境未能及时启动。请稍后重新运行。',
    'hub-unavailable': '暂时无法连接 JupyterHub。请稍后重新运行。',
    'hub-profile-changed': '环境配置已变化，请重新打开当前版本的预览后运行。',
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
  cancelled: 'The execution environment connection was canceled',
  proxyStatic: name => `Environment ${name} connects through the Presmium server’s proxy, which a static page does not have`,
  noUrl: name => `Environment ${name} has no usable url`,
  noToken: name => `No access token was given for environment ${name}`,
  refused: name => `Environment ${name} refused the access token. Run again and enter it.`,
  unreachable: (name, reason) => `Couldn’t reach environment ${name}. ${reason}`,
  reasons: {
    'jupyter-no-answer': 'The Jupyter service didn’t answer within 10 seconds. Run again shortly.',
    'jupyter-closed': 'The connection to the Jupyter service closed. Run again.',
    network: 'Couldn’t reach the Jupyter service. Check the network and the service address, then run again.',
    'hub-not-configured': 'JupyterHub environments are not configured on this service. Contact the operator, then try again.',
    'hub-profile-unavailable': 'This environment profile is unavailable. Choose an operator-provided profile in the document, then try again.',
    'hub-start-failed': 'The execution environment failed to start. Try again shortly, or ask the operator to check its startup diagnostics.',
    'hub-start-timeout': 'The execution environment did not start in time. Run again shortly.',
    'hub-unavailable': 'Couldn’t reach JupyterHub. Run again shortly.',
    'hub-profile-changed': 'The environment configuration changed. Reopen the preview of the current version, then run again.',
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
