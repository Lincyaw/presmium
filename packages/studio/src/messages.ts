export { systemLocale } from '@lincyaw/dsh/launch'
// Only the `studio  <url>` line on standard output is read by programs; it is the same in both languages.
export type Locale = 'zh-CN' | 'en'

export interface StudioMessages {
  usage: string
  badPort(value: string): string
  unexpectedArgument(argument: string): string
  notDirectory(dir: string): string
  log(file: string): string
  openOnNetwork(address: string, port: string, previewPort: string): string
  ended(how: string, log: string): string
  portInUse(port: number, address: string): string
  noFreePort(address: string): string
  badHost(address: string): string
  wholeLog(message: string, file: string): string
  serviceEnded: string
  appEnded: string
  modelVariables(variables: readonly string[], unset: string[]): string
}

export const STUDIO_MESSAGES: Record<Locale, StudioMessages> = {
  'zh-CN': {
    usage: `用法：presmium studio [<目录>] [<选项>]

启动 Presmium Studio（实验性）：在浏览器中编辑这个目录（工作区的根目录或一份文稿所在的目录；
默认为 .）中的文稿，并为它提供工作区服务。只打印一个要在浏览器中打开的网址。AI 助手所用的模型在
“设置 → 模型”中设置，也可以由环境变量给出：DEEPSEEK_API_KEY，或者兼容 Messages 接口的服务的
PRESMIUM_MODEL_URL、PRESMIUM_MODEL_KEY 与 PRESMIUM_MODEL_PROVIDER。对话、模型设置、密钥与日志
presmium-studio-<散列>.log（每个安装一个）保存在 $XDG_STATE_HOME/presmium/studio 中。

选项：
  --port <端口>  Presmium Studio 的端口（默认为 4320，被占用时取空闲端口）
  --host <地址>  改为监听本机在局域网中的这个地址，而不是 127.0.0.1，且没有登录：
                 任何能访问这个端口的人都以你的身份操作
  -h, --help     显示本说明`,
    badPort: value => `--port 需要 0 到 65535 之间的端口号，而不是“${value}”。`,
    unexpectedArgument: argument => `多余的参数“${argument}”。只能给出一个目录。`,
    notDirectory: dir => `${dir} 不是目录。请给出工作区的根目录或一份文稿所在的目录。`,
    log: file => `presmium studio: 日志在 ${file}`,
    openOnNetwork: (address, port, previewPort) => `presmium studio: 正在 ${address} 上监听，局域网中的设备可以访问，且没有登录：任何能用上面的网址访问端口 ${port}（以及预览的端口 ${previewPort}）的人都以你的身份使用这个工作区（编辑、运行代码、使用你的模型）。请只在可信的网络中使用；不加 --host 时只在本机监听。`,
    ended: (how, log) => `presmium studio: ${how}。日志在 ${log}`,
    portInUse: (port, address) => `${address} 的端口 ${port} 已被占用。请用 --port 指定另一个端口。`,
    noFreePort: address => `${address} 上没有空闲的端口。请停止占用端口的服务后重试。`,
    badHost: address => `--host 需要本机的一个地址，例如 192.168.0.21，而不是“${address}”（Presmium Studio 只在一个确定的地址上监听，不能同时监听全部地址）。`,
    wholeLog: (message, file) => `${message}${message.endsWith('\n') ? '' : '。'}完整的日志在 ${file}`,
    serviceEnded: '工作区服务（presmium serve）已停止',
    appEnded: 'Presmium Studio 的应用进程已停止',
    modelVariables: (variables, unset) => `${variables.join('、')} 需要同时设置；没有设置 ${unset.join('、')}。`,
  },
  'en': {
    usage: `Usage: presmium studio [dir] [options]

Presmium Studio (experimental): edit the documents of the directory (the workspace root, or a deck’s
directory; default: .) in the browser, with the workspace service of that directory. It prints the one
address to open in the browser. The AI Assistant’s model is chosen in Settings > Models, or given by the
environment: DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY, and PRESMIUM_MODEL_PROVIDER
for a Messages-compatible service. Chats, model settings, API keys, and the log
presmium-studio-<hash>.log (one per installation) are kept in $XDG_STATE_HOME/presmium/studio.

Options:
  --port <n>     Presmium Studio’s port (default: 4320, or a free one when that is in use)
  --host <addr>  listen on this address of the machine on the local network instead of 127.0.0.1, with
                 no login: whoever reaches the port works as you
  -h, --help     show this help`,
    badPort: value => `--port takes a port number from 0 to 65535, not “${value}”.`,
    unexpectedArgument: argument => `Unexpected argument “${argument}”. Give one directory.`,
    notDirectory: dir => `${dir} is not a directory. Give the workspace root, or the directory of a document.`,
    log: file => `presmium studio: log ${file}`,
    openOnNetwork: (address, port, previewPort) => `presmium studio: listening on ${address}, on the local network, with no login: anyone who reaches port ${port} (and the previews’ port ${previewPort}) with the address above works in this workspace as you (edits, runs code, uses your model). Use it on a network you trust; without --host it listens on this machine only.`,
    ended: (how, log) => `presmium studio: ${how}; the log is ${log}`,
    portInUse: (port, address) => `Port ${port} of ${address} is in use. Give another with --port.`,
    noFreePort: address => `There is no free port on ${address}. Stop a service that uses one, then retry.`,
    badHost: address => `--host takes one address of this machine, such as 192.168.0.21, not “${address}” (Presmium Studio listens on one concrete address, never on all of them).`,
    wholeLog: (message, file) => `${message.endsWith('\n') ? message : `${message}; `}the whole log is ${file}`,
    serviceEnded: 'the workspace service (presmium serve) ended',
    appEnded: 'the Presmium Studio app ended',
    modelVariables: (variables, unset) => `${variables.join(', ')} go together; ${unset.join(' and ')} ${unset.length > 1 ? 'are' : 'is'} not set.`,
  },
}

