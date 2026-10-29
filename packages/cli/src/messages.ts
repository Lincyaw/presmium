export { systemLocale } from '@lincyaw/kernel/node'
import { DOCUMENT_ENTRY } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel'

// The lines that start with a key and two spaces (`serve  <url>`, `workspace  <root>`, `mcp  <url>`, `<renderer>  <url>`)
// are read by programs (`@lincyaw/dsh/launch`, the tests): their keys, URLs and paths stay the same in both languages.
export interface CliMessages {
  usage: string
  missingCommand: string
  unknownCommand(name: string): string
  optionNotFor(option: string, command: string): string
  unexpectedArgument(argument: string): string
  toNotForWorkspace: string
  audienceNotForWorkspace: string
  badAudience(value: string): string
  notFound(entry: string): string
  emptyTo: string
  badAllow(kinds: readonly string[], value: string): string
  badPreviewOrigin(value: string): string
  badPublicUrl(value: string): string
  badPort(option: string, value: string): string
  unmountFailed(error: string): string
  compiled(sections: number, summary: string): string
  token(file: string): string
  watching(ir: string): string
  serveOpen(address: string, port: string): string
  noFfmpeg(command: string): string
  newMissing: string
  studioMissing: string
  noProblems: string
  counts(errors: number, warnings: number, infos: number): string
  severity: Record<'error' | 'warning' | 'info', string>
  hint(text: string): string
  lock(file: string, changed: boolean, anchors: number): string
  documentRuns(executed: number, cached: number): string
  notRendered(blocks: number): string
  codeRuns(executed: number, cached: number, sandbox?: string): string
}

export const CLI_MESSAGES: Record<Locale, CliMessages> = {
  'zh-CN': {
    usage: `用法：presmium <命令> [<文稿>] [<选项>]

<文稿> 是含有 ${DOCUMENT_ENTRY} 的目录，或这个文件本身（默认为 .）。

命令：
  new     在目录中新建项目（没有给出时逐项询问），由 create-presmium 完成
          --type <种类>   lecture、workspace、site 或 plugin（默认询问）
          --theme <主题>  site 的主题：course、docs 或 showcase（默认 course）
          --title <标题>  讲义、工作区或网站的标题
          --name <包名>   插件的包名
          --no-git        不运行 git init
  skills  安装内置技能（与 MCP 和可视化编辑器共用）
          install <目录> [--json]  安装缺少的 .agents/skills，保留已有技能
          --name <技能>   只安装指定技能，可重复
          --json          以 JSON 打印安装结果
  build   导出文稿：写出 <输出>/ir.json 与 <输出>/<形态>/；在工作区的根目录
          （有 presmium.workspace.yaml）把整个工作区导出为网站，写到 <输出>/web/
          --to <形态>     要导出的形态，以逗号分隔（默认为文稿声明的形态）
          --out <目录>    输出目录（默认为 <文稿>/dist）
          --audience <名称>  只导出面向这类读者的内容（例如 student），并在写出的每个
                          文件中查找被略去内容的句子
  dev     实时预览：启动 Presmium 服务与各形态的预览服务器，保存后自动更新
          --to <形态>     要预览的形态，以逗号分隔
          --out <目录>    工作目录（默认为 <文稿>/.presmium/dev）
          --server-port <端口>  Presmium 服务的端口（默认为空闲端口）
          --allow <种类>  无需询问即允许的操作：operate、spend、write、agent
  ir      以 JSON 打印文稿的运行快照
          --out <文件>    写入文件，而不是打印
  check   检查文稿并运行插件的检查
          --json          以 JSON 打印结果
          --update-lock   重新定位代码锚点，并重写 .presmium/anchors.lock.json
          --env           同时连接 execute.environments 中的运行环境
          --audience <名称>  按面向这类读者的内容检查
          --external-links   同时检查外部链接（装有 lychee 时用它）
  serve   在本机提供工作区服务（参数是工作区的根目录或一份文稿）：工作区网站、
          各文稿与其版本历史、审阅、插件的服务端路由与课堂同步；不加 --host 时
          只在本机监听
          --port <端口>   端口（默认为 4310）
          --host <地址>   监听的地址（默认为 127.0.0.1）；0.0.0.0 或局域网中的地址
                          让同一网络中的其他设备也能使用，且没有登录：任何能访问
                          这个端口的人都以你的身份操作
          --operator-dir <目录>  运营者目录（默认为用户的状态目录）
          --preview-origin <来源>  （可重复）嵌入预览的 Presmium Studio 页面的来源，
                          例如 http://127.0.0.1:4320；设置 PRESMIUM_SERVICE_TOKEN 时，
                          工作区的路由要求它（Authorization: Bearer）
          --public-url <来源>  反向代理在前面时浏览器使用的来源：信任它的主机，
                          预览与产物的地址用它给出
  studio  启动 Presmium Studio（实验性）：浏览器中的编辑应用与这个目录（工作区的
          根目录或一份文稿）的工作区服务，只打印一个要打开的网址。需要另外安装
          @lincyaw/studio（约 865 MB）
          --port <端口>   Presmium Studio 的端口（默认为 4320，被占用时取空闲端口）
          --host <地址>   改为监听本机在局域网中的这个地址，而不是 127.0.0.1，且没有
                          登录：任何能访问这个端口的人都以你的身份操作

  -h, --help   显示本说明

退出码：0 没有错误，1 有错误级别的问题，2 用法错误或内部错误。`,
    missingCommand: '缺少命令。请在 presmium 之后给出命令，例如 presmium build。',
    unknownCommand: name => `没有命令“${name}”。可用的命令见 presmium --help。`,
    optionNotFor: (option, command) => `选项 --${option} 不能用于 presmium ${command}。可用的选项见 presmium --help。`,
    unexpectedArgument: argument => `多余的参数“${argument}”。每个命令只接受一个文稿或目录。`,
    toNotForWorkspace: '--to 不能用于工作区：工作区总是导出为网站。',
    audienceNotForWorkspace: '--audience 暂不能用于工作区。请分别为每份文稿加 --audience 导出。',
    badAudience: value => `“${value}”不是读者类别的名称。请给出字母、数字、.、_ 或 - 组成的名称，例如 student。`,
    notFound: entry => `找不到 ${entry}。请检查路径，或用 presmium new 新建文稿。`,
    emptyTo: '--to 至少需要一个形态，例如 --to web。',
    badAllow: (kinds, value) => `--allow 不接受“${value}”。可用的种类：${kinds.join('、')}。`,
    badPreviewOrigin: value => `“${value}”不是来源。请给出协议、主机与端口，例如 http://127.0.0.1:4320。`,
    badPublicUrl: value => `“${value}”不是来源。请给出浏览器访问的协议与主机，例如 https://preview.example.com。`,
    badPort: (option, value) => `${option} 需要 0 到 65535 之间的端口号，而不是“${value}”。`,
    unmountFailed: error => `presmium: 无法关闭上一次加载的服务端扩展：${error}`,
    compiled: (sections, summary) => `已更新 ${sections} 个页面；${summary}`,
    token: file => ` （访问令牌在 ${file} 中）`,
    watching: ir => `正在监视修改；运行快照在 ${ir}`,
    noFfmpeg: command => `presmium serve: 没有找到 FFmpeg，讲授视频只能由浏览器导出为 WebM，画质较低。安装后可导出清晰的 MP4：${command}`,
    serveOpen: (address, port) => `presmium serve: 正在 ${address} 上监听，局域网中的设备可以访问，且没有登录：任何能访问端口 ${port} 的人都以你的身份使用这个工作区（编辑、运行代码、允许操作）。请只在可信的网络中使用；不加 --host 时只在本机监听。`,
    newMissing: 'presmium new: 没有安装 create-presmium。它随 presmium 一起安装，请运行 pnpm add -g @lincyaw/presmium。',
    studioMissing: 'presmium studio: 这里没有安装 Presmium Studio（实验性，约 865 MB）。请运行 pnpm add -g @lincyaw/studio 后使用 presmium-studio，或在本项目中运行 pnpm add -D @lincyaw/studio。',
    noProblems: '没有问题',
    counts: (errors, warnings, infos) => `${errors} 个错误，${warnings} 个警告，${infos} 条信息`,
    severity: { error: '错误', warning: '警告', info: '信息' },
    hint: text => `    建议：${text}`,
    lock: (file, changed, anchors) => `${file} ${changed ? '已更新' : '没有变化'}（${anchors} 个锚点）`,
    documentRuns: (executed, cached) => `  （代码运行：执行 ${executed} 个，取自缓存 ${cached} 个）`,
    notRendered: blocks => `  （${blocks} 个内容块未显示）`,
    codeRuns: (executed, cached, sandbox) => `代码运行：执行 ${executed} 个，取自缓存 ${cached} 个${sandbox ? `，隔离方式为 ${sandbox}` : ''}`,
  },
  'en': {
    usage: `Usage: presmium <command> [deck] [options]

The deck is a directory holding ${DOCUMENT_ENTRY}, or that entry file (default: .).

Commands:
  new     a new project in the directory (default: asks), from create-presmium
          --type <kind>   lecture, workspace, site, or plugin (default: asks)
          --theme <name>  site theme: course, docs, or showcase (default: course)
          --title <text>  the lecture, workspace, or site title
          --name <name>   the plugin’s package name
          --no-git        do not run git init
  skills  install bundled skills, shared with MCP and the visual editor
          install <dir> [--json]  install missing .agents/skills; keep existing skills
          --name <skill>  install only the named skill; repeat for more
          --json          print the installation result as JSON
  build   export the deck: writes <out>/ir.json and <out>/<renderer>/; at a workspace root
          (presmium.workspace.yaml) exports the workspace as a website into <out>/web/
          --to <ids>      forms to export, comma-separated (default: the deck’s renderers)
          --out <dir>     output directory (default: <deck>/dist)
          --audience <name>  only the content for this audience (e.g. student); then every file
                          written is scanned for the sentences of the content left out
  dev     live preview: starts the Presmium server and the renderers’ dev servers, updates on save
          --to <ids>      forms to preview, comma-separated
          --out <dir>     working directory (default: <deck>/.presmium/dev)
          --server-port <n>  port of the Presmium server (default: a free port)
          --allow <kinds>    approvals given without asking: operate, spend, write, agent
  ir      print the runtime snapshot as JSON
          --out <file>    write it to a file instead
  check   check the deck and run the plugins’ checks
          --json          print the result as JSON
          --update-lock   re-resolve anchors and rewrite .presmium/anchors.lock.json
          --env           also connect to the environments of execute.environments
          --audience <name>  check the content for this audience
          --external-links   also check the external links, with lychee when it is installed
  serve   the workspace service for you on this machine (the argument is the workspace root, or
          a deck): the workspace site, the documents and their history, the reviews, the plugins’
          routes, and the classroom sync; without --host it listens on this machine only
          --port <n>      port (default: 4310)
          --host <addr>   address to listen on (default: 127.0.0.1); 0.0.0.0 or an address on the
                          local network opens it to your other devices there, with no login:
                          whoever reaches the port works as you
          --operator-dir <dir>  the operator directory (default: the user’s state directory)
          --preview-origin <origin>  (repeatable) the origin of a Presmium Studio whose pages embed
                          the previews, e.g. http://127.0.0.1:4320; with PRESMIUM_SERVICE_TOKEN set,
                          the workspace’s routes ask for it (Authorization: Bearer)
          --public-url <origin>  the origin browsers use when a reverse proxy fronts the service:
                          its host is trusted, and previews and outputs are linked under it
  studio  Presmium Studio (experimental): the editing app in the browser and the workspace service
          of the directory (the workspace root, or a deck); prints the one address to open. It is
          the package @lincyaw/studio (about 865 MB), installed beside this one
          --port <n>      Presmium Studio’s port (default: 4320, or a free one when that is in use)
          --host <addr>   listen on this address of the machine on the local network instead of
                          127.0.0.1, with no login: whoever reaches the port works as you

  -h, --help   show this help

Exit Codes: 0 no errors, 1 error findings, 2 usage or internal error.`,
    missingCommand: 'No command given. Put a command after presmium, for example presmium build.',
    unknownCommand: name => `There is no command “${name}”. See presmium --help for the commands.`,
    optionNotFor: (option, command) => `The option --${option} does not apply to presmium ${command}. See presmium --help for its options.`,
    unexpectedArgument: argument => `Unexpected argument “${argument}”. Each command takes one deck or directory.`,
    toNotForWorkspace: '--to does not apply to a workspace: its site is the web form.',
    audienceNotForWorkspace: '--audience does not apply to a workspace yet. Export each document with --audience instead.',
    badAudience: value => `“${value}” is not the name of an audience. Give a name of letters, digits, ., _, or -, such as student.`,
    notFound: entry => `Couldn’t find ${entry}. Check the path, or make a document with presmium new.`,
    emptyTo: '--to needs at least one renderer, such as --to web.',
    badAllow: (kinds, value) => `--allow does not take “${value}”. The kinds are ${kinds.join(', ')}.`,
    badPreviewOrigin: value => `“${value}” is not an origin. Give a scheme, host, and port, such as http://127.0.0.1:4320.`,
    badPublicUrl: value => `“${value}” is not an origin. Give the scheme and host browsers use, such as https://preview.example.com.`,
    badPort: (option, value) => `${option} takes a port number from 0 to 65535, not “${value}”.`,
    unmountFailed: error => `presmium: couldn’t close the previous server contributions: ${error}`,
    compiled: (sections, summary) => `compiled ${sections} sections; ${summary}`,
    token: file => ` (its token is in ${file})`,
    watching: ir => `watching; runtime snapshot in ${ir}`,
    noFfmpeg: command => `presmium serve: FFmpeg was not found, so lecture videos export from the browser as WebM, at a lower quality. Install it for sharp MP4 videos: ${command}`,
    serveOpen: (address, port) => `presmium serve: listening on ${address}, on the local network, with no login: anyone who reaches port ${port} uses this workspace as you (edits, runs code, approves). Use it on a network you trust; without --host it listens on this machine only.`,
    newMissing: 'presmium new: create-presmium is not installed. It comes with the presmium package: run pnpm add -g @lincyaw/presmium.',
    studioMissing: 'presmium studio: Presmium Studio is not installed here (experimental, about 865 MB). Run pnpm add -g @lincyaw/studio, then presmium-studio; or run pnpm add -D @lincyaw/studio in this project.',
    noProblems: 'no problems',
    counts: (errors, warnings, infos) => `${errors} errors, ${warnings} warnings, ${infos} infos`,
    severity: { error: 'error', warning: 'warning', info: 'info' },
    hint: text => `    hint: ${text}`,
    lock: (file, changed, anchors) => `${file} ${changed ? 'updated' : 'unchanged'} (${anchors} anchors)`,
    documentRuns: (executed, cached) => `  (code runs: ${executed} executed, ${cached} from cache)`,
    notRendered: blocks => `  (${blocks} blocks not rendered)`,
    codeRuns: (executed, cached, sandbox) => `code runs: ${executed} executed, ${cached} from cache${sandbox ? `, isolated by ${sandbox}` : ''}`,
  },
}

