export { systemLocale } from '@lincyaw/kernel/node'
import { DOCUMENT_ENTRY } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel'
import type { SpeechSettingsError } from '@lincyaw/kernel/node'
import type { ScriptError } from './script.ts'

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
  newMissing: string
  studioMissing: string
  mcpMissing: string
  noProblems: string
  counts(errors: number, warnings: number, infos: number): string
  severity: Record<'error' | 'warning' | 'info', string>
  hint(text: string): string
  lock(file: string, changed: boolean, anchors: number): string
  documentRuns(executed: number, cached: number): string
  notRendered(blocks: number): string
  codeRuns(executed: number, cached: number, sandbox?: string): string
  importMissing: string
  badGroup(value: string): string
  imported(documents: number, files: number, out: string): string
  importUnresolved(note: string, link: string): string
  importPatterns(patterns: string[]): string
  badVoice(value: string): string
  documentChanged: string
  documentInvalid(detail: string): string
  voiceoverUnavailable: string
  voiceoverLabels: Record<'document' | 'voice' | 'service' | 'sentences' | 'missing' | 'blocked' | 'prune', string>
  voiceoverPlace(page: number, step: number): string
  voiceoverReasons: Record<string, string>
  voiceoverReasonOther(code: string): string
  voiceoverNoVoice: string
  voiceoverUnset: string
  voiceoverVoiceChange(next: string, previous: string): string
  voiceoverVoiceDefault(voice: string): string
  voiceoverService(id: string, provider: string, local: boolean): string
  voiceoverServiceMissing(id: string): string
  voiceoverCounts(total: number, cached: number, missing: number, skipped: number, blocked: number): string
  voiceoverMissing(count: number, characters: number, voices: string[]): string
  voiceoverCharges(providers: string[]): string
  voiceoverLocal: string
  voiceoverBlocked(count: number, reason: string, places: string[], more: boolean): string
  voiceoverPruneErrors: string
  voiceoverPruneUnavailable: string
  voiceoverPruneEngineUnknown: string
  voiceoverPruneWould(count: number, megabytes: string, kept: number): string
  voiceoverDryRun: string
  voiceoverNothing: string
  voiceoverNothingElse: string
  voiceoverVoiceRefused(voice: string, reason: string): string
  voiceoverVoiceSaved(voice: string): string
  voiceoverGenerating(done: number, total: number): string
  voiceoverCancelled(generated: number): string
  voiceoverStale(generated: number): string
  voiceoverGenerated(generated: number): string
  voiceoverRunError(reason: string): string
  voiceoverPruned(count: number, megabytes: string): string
  voiceoverLeft(missing: number, blocked: number): string
  speechUsage: string
  speechKeyLabels: Record<'workspace' | 'key' | 'file', string>
  speechKeySaved(appId: boolean): string
  speechKeyEnvironment(variable: string): string
  speechKeyNone(variable: string): string
  speechKeyPrompt: string
  speechKeyCancelled: string
  speechKeyEmpty: string
  speechKeyStored(file: string): string
  speechKeyCleared: string
  speechKeyClearedEnvironment(variable: string): string
  speechKeyErrors: Record<SpeechSettingsError['code'], (file: string) => string>
  scriptUsage: string
  /** Written into the exported file, in the document's language. */
  scriptInstructions: string
  scriptExported(file: string, narrations: number, steps: number): string
  scriptUnchanged: string
  scriptImported(changed: string[]): string
  scriptNext(document: string): string
  scriptErrors: Record<ScriptError['code'], (detail: string[], line?: number) => string>
}

const list = (items: unknown, separator: string) => [items].flat().join(separator)
const sentences = (count: number) => `${count} ${count === 1 ? 'sentence' : 'sentences'}`
const entries = (count: number) => `${count} cached audio ${count === 1 ? 'entry' : 'entries'}`

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
          --update        把已有的技能换成这个版本的（升级 Presmium 之后）
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
  import  把 Markdown 笔记转成文稿（参数是一个 .md 文件或一个文件夹）：每份笔记成为
          <输出>/<路径>/${DOCUMENT_ENTRY}，一级与二级标题各开一个页面；[[笔记]] 与 [[笔记|文字]]
          按文件名或 frontmatter 的 aliases 找到对应的文稿，笔记链接的本地文件复制到文稿的
          attachments/；再次导入时覆盖写过的文稿
          --out <目录>    写到这个目录（默认为 .，通常是工作区的根目录）
          --exclude <名称>  （可重复）不导入、也不复制其中文件的文件夹或文件，可用 *，例如 raw
          --lang <语言>   没有在 frontmatter 中写 lang 的笔记的语言（默认按文字判断）
          --group <层数>  把笔记所在的第几层文件夹作为文稿的第一个标签；网站的侧栏按第一个
                          标签分组，例如 --group 2 让 projects/<项目>/ 中的笔记成为一组
  check   检查文稿并运行插件的检查
          --json          以 JSON 打印结果
          --update-lock   重新定位代码锚点，并重写 .presmium/anchors.lock.json
          --env           同时连接 execute.environments 中的运行环境
          --audience <名称>  按面向这类读者的内容检查
          --external-links   同时检查外部链接（装有 lychee 时用它）
  voiceover  生成文稿的配音。不加 --yes 时只报告要做什么：语音服务、音色、缺少配音的语句数与
          字符数（云端语音服务按字符计费），不生成配音，也不修改文件；加 --yes 时只生成缺少的配音，
          与 Presmium Studio 用同一套执行，不需要运行中的服务。语音服务与密钥按 presmium serve 的
          方式读取（工作区的运营者目录、PRESMIUM_SPEECH_* 环境变量）
          --voice <服务>:<音色>  先把文稿的默认音色设为它，例如
                          volcengine:zh_female_tianmeitaozi_uranus_bigtts
          --yes           确认执行：生成配音（可能由语音服务计费），写入 --voice 与 --prune 的修改
          --prune         删除当前讲稿都不用的配音缓存（.presmium/speech/ 中的文件与 speech.lock.json
                          中的条目）
          --json          以 JSON 打印结果
  script  把讲稿导出为一份 Markdown 文件润色，再导回文稿
          export <文稿>   写出每一步的讲稿：每段在它的标记行 <!-- n: … --> 之下，换行与空行照原样，
                          {显示|读法} 是显示与读法不同的词，⟦cue:…⟧ 是提示点，\\ 使后面的 \\、{、}、|、
                          ⟦、⟧ 作为文字
          import <文稿> [<文件>]  把改过的讲稿写回 lecture.json，只改动有变化的讲稿；标记缺失或未知、
                          提示点被删除或移到别的段落时不写入
          --out <文件>    export 写到这个文件（默认为 <文稿>/dist/script.md，也是 import 默认读的文件）
  speech  语音服务的设置
          key set [<目录>]     从标准输入读入火山引擎的语音 API Key（不回显），保存在工作区的运营者
                               目录中，与 Presmium Studio 的“设置 → 语音服务”是同一个文件
          key clear [<目录>]   清除保存的密钥
          key status [<目录>]  显示是否配置了密钥与它的来源，不显示密钥；运营者目录可以用
                               PRESMIUM_OPERATOR_DIR 指定
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
          --public-url <网址>  反向代理在前面时浏览器使用的地址：信任它的主机，预览与产物
                          的地址用它给出；带路径时代理原样转发该路径，服务的全部内容都在它下面
          --allow <种类>  无需询问即允许的操作：operate、spend、write、agent（默认在打开的
                          Presmium 窗口中询问）
  mcp     以标准输入输出提供 MCP 服务，供 Claude Code、Codex 等 AI 工具连接：这个目录的
          Presmium Studio 或 presmium serve 正在运行时转接到它，AI 可以修改文稿；否则只编译
          文稿，提供阅读、检查与导出。详见 presmium mcp --help
  studio  启动 Presmium Studio（实验性）：浏览器中的编辑应用与这个目录（工作区的
          根目录或一份文稿）的工作区服务，只打印一个要打开的网址。随 Presmium 一起安装
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
    badPublicUrl: value => `“${value}”不是可用的网址。请给出浏览器访问的地址，例如 https://preview.example.com 或 https://example.com/user/a/preview/。`,
    badPort: (option, value) => `${option} 需要 0 到 65535 之间的端口号，而不是“${value}”。`,
    unmountFailed: error => `presmium: 无法关闭上一次加载的服务端扩展：${error}`,
    compiled: (sections, summary) => `已更新 ${sections} 个页面；${summary}`,
    token: file => ` （访问令牌在 ${file} 中）`,
    watching: ir => `正在监视修改；运行快照在 ${ir}`,
    serveOpen: (address, port) => `presmium serve: 正在 ${address} 上监听，局域网中的设备可以访问，且没有登录：任何能访问端口 ${port} 的人都以你的身份使用这个工作区（编辑、运行代码、允许操作）。请只在可信的网络中使用；不加 --host 时只在本机监听。`,
    newMissing: 'presmium new: 没有安装 create-presmium。它随 presmium 一起安装，请运行 pnpm add -g @lincyaw/presmium。',
    studioMissing: 'presmium studio: 没有安装 Presmium Studio。它随 Presmium 一起安装，请运行 pnpm add -g @lincyaw/presmium。',
    mcpMissing: 'presmium mcp: 没有安装 @lincyaw/mcp。它随 Presmium 一起安装，请运行 pnpm add -g @lincyaw/presmium。',
    noProblems: '没有问题',
    counts: (errors, warnings, infos) => `${errors} 个错误，${warnings} 个警告，${infos} 条信息`,
    severity: { error: '错误', warning: '警告', info: '信息' },
    hint: text => `    建议：${text}`,
    lock: (file, changed, anchors) => `${file} ${changed ? '已更新' : '没有变化'}（${anchors} 个锚点）`,
    documentRuns: (executed, cached) => `  （代码运行：执行 ${executed} 个，取自缓存 ${cached} 个）`,
    notRendered: blocks => `  （${blocks} 个内容块未显示）`,
    codeRuns: (executed, cached, sandbox) => `代码运行：执行 ${executed} 个，取自缓存 ${cached} 个${sandbox ? `，隔离方式为 ${sandbox}` : ''}`,
    badGroup: value => `--group 需要 1 或更大的整数，而不是“${value}”。`,
    importMissing: '缺少要导入的笔记。请给出一个 .md 文件或一个文件夹，例如 presmium import notes --out site。',
    imported: (documents, files, out) => `已导入 ${documents} 份文稿，复制了 ${files} 个文件，写在 ${out}`,
    importUnresolved: (note, link) => `${note}：链接 ${link} 没有对应的笔记或文件，已改为普通文字`,
    importPatterns: patterns => `presmium.workspace.yaml 的 documents 需要包含：\n${patterns.map(pattern => `  - '${pattern}'`).join('\n')}`,
    badVoice: value => `--voice 需要“<服务>:<音色>”，例如 volcengine:zh_female_tianmeitaozi_uranus_bigtts，而不是“${value}”。`,
    documentChanged: '文稿在读取之后被修改过，没有写入。请重新运行。',
    documentInvalid: detail => `修改后的文稿无效，没有写入：${detail}`,
    voiceoverUnavailable: '这份文稿不能生成配音：它的插件中需要有 @lincyaw/addon-lecture 与 @lincyaw/addon-speech（在 Presmium Studio 中启用视频制作时会加上）。',
    voiceoverLabels: { document: '文稿', voice: '音色', service: '语音服务', sentences: '语句', missing: '需要生成', blocked: '无法生成', prune: '可清理' },
    voiceoverPlace: (page, step) => `第 ${page} 页第 ${step} 步`,
    voiceoverReasons: {
      'voice-unset': '没有设置音色',
      'cue-step': '讲稿中有换到下一步的提示点，而这一页按步骤设置了音色',
      'voice-step-binding-unavailable': '步骤与讲稿的对应已变化，需要重新检查音色设置',
      'step-binding-stale': '步骤与讲稿的对应已变化，需要重新检查音色设置',
      'speech-unavailable': '文稿没有语音服务插件',
      'voice-not-configured': '没有配置语音服务',
      'voice-engine-unknown': '没有配置这个语音服务',
      'voice-engine-unsupported': '这个语音服务不能生成配音',
      'voice-catalog-unavailable': '无法读取语音服务的音色列表',
      'voice-unavailable': '语音服务中没有这个音色，或它不支持文稿的语言',
      'voice-revision-changed': '文稿已更新',
      'voice-source-changed': '文稿已更新',
      'speech-authentication': '语音服务拒绝了密钥，可以用 presmium speech key set 更新',
      'speech-permission': '语音服务拒绝访问：检查是否已开通语音合成 2.0，以及密钥的服务与音色权限',
      'speech-quota': '语音服务额度不足',
      'speech-busy': '语音服务并发已满，稍后重试',
      'speech-network': '无法连接语音服务',
      'speech-empty-audio': '语音服务没有返回音频',
      'speech-invalid-request': '语音服务不接受这段讲稿或音色参数',
      'speech-provider': '语音服务暂时无法生成配音',
      'speech-cache-failed': '配音缓存无法写入，检查磁盘空间与目录权限',
    },
    voiceoverReasonOther: code => `其他原因（${code}）`,
    voiceoverNoVoice: '不配音',
    voiceoverUnset: '未设置',
    voiceoverVoiceChange: (next, previous) => `${next}（将取代 ${previous} 成为文稿的默认音色）`,
    voiceoverVoiceDefault: voice => `${voice}（文稿的默认音色）`,
    voiceoverService: (id, provider, local) => `${id}（${provider}，${local ? '本机' : '云端'}）`,
    voiceoverServiceMissing: id => `${id}（未配置）`,
    voiceoverCounts: (total, cached, missing, skipped, blocked) => `${total} 句：${cached} 句已有配音，${missing} 句需要生成${skipped ? `，${skipped} 句不配音或使用录音` : ''}${blocked ? `，${blocked} 句无法生成` : ''}`,
    voiceoverMissing: (count, characters, voices) => `${count} 句，约 ${characters} 个字符，音色 ${list(voices, '、')}`,
    voiceoverCharges: providers => `云端语音服务按字符计费（${list(providers, '、')}）；生成的配音由 AI 生成。`,
    voiceoverLocal: '在本机生成；生成的配音由 AI 生成。',
    voiceoverBlocked: (count, reason, places, more) => `${count} 句：${reason}（${list(places, '、')}${more ? '…' : ''}）`,
    voiceoverPruneErrors: '文稿有错误，没有清理配音缓存：讲稿可能没有全部读出。请先用 presmium check 检查并修复。',
    voiceoverPruneUnavailable: '文稿的语音服务插件不能清理配音缓存。请更新 Presmium。',
    voiceoverPruneEngineUnknown: '有的语句没有指定语音服务，也没有配置默认的语音服务，无法判断哪些配音缓存在用，没有清理。',
    voiceoverPruneWould: (count, megabytes, kept) => `${count} 条配音缓存没有语句使用（${megabytes} MB），保留 ${kept} 条`,
    voiceoverDryRun: '以上只是预览，没有生成配音，也没有修改文件。加 --yes 执行。',
    voiceoverNothing: '每一句都有配音，没有要做的事。',
    voiceoverNothingElse: '其余语句都有配音。',
    voiceoverVoiceRefused: (voice, reason) => `没有把默认音色设为 ${voice}：${reason}。`,
    voiceoverVoiceSaved: voice => `已把文稿的默认音色设为 ${voice}`,
    voiceoverGenerating: (done, total) => `正在生成配音 ${done} / ${total}`,
    voiceoverCancelled: generated => `已取消；已生成的 ${generated} 句配音保留。`,
    voiceoverStale: generated => `文稿在生成时被修改，已停止；已生成的 ${generated} 句配音保留。`,
    voiceoverGenerated: generated => `已完成：生成了 ${generated} 句配音`,
    voiceoverRunError: reason => `生成失败：${reason}`,
    voiceoverPruned: (count, megabytes) => `已删除 ${count} 条没有语句使用的配音缓存（${megabytes} MB）`,
    voiceoverLeft: (missing, blocked) => `仍有 ${missing + blocked} 句没有配音。`,
    speechUsage: 'presmium speech 的命令是 key set、key clear 与 key status，例如 presmium speech key status。',
    speechKeyLabels: { workspace: '工作区', key: '语音密钥', file: '文件' },
    speechKeySaved: appId => `已配置，保存在本机${appId ? '（带 App ID）' : ''}；服务权限在生成配音时验证`,
    speechKeyEnvironment: variable => `已配置，来自环境变量 ${variable}`,
    speechKeyNone: variable => `未配置；用 presmium speech key set 保存，或设置环境变量 ${variable}`,
    speechKeyPrompt: '火山引擎的语音 API Key（输入时不显示）：',
    speechKeyCancelled: '已取消，没有保存密钥。',
    speechKeyEmpty: '没有读到密钥。请在提示后输入，或从标准输入传入，例如 presmium speech key set < key.txt。',
    speechKeyStored: file => `已保存火山引擎的语音密钥：${file}。正在运行的 Presmium Studio 与 presmium serve 无需重启。`,
    speechKeyCleared: '已清除本机保存的密钥。',
    speechKeyClearedEnvironment: variable => `已清除本机保存的密钥；现在使用环境变量 ${variable} 中的密钥。`,
    speechKeyErrors: {
      'speech-settings-conflict': () => '语音服务设置已在别处更新。请重新运行。',
      'speech-settings-invalid': () => '密钥无效：需要 8 到 8192 个可见字符，不含空格。',
      'speech-settings-busy': () => '语音服务设置正在被更新。请稍后重试。',
      'speech-settings-unavailable': file => `无法读取或写入语音服务设置：${file}`,
    },
    scriptUsage: '用法：presmium script export <文稿> [--out <文件>]，或 presmium script import <文稿> [<文件>]。',
    scriptInstructions: '讲稿：字幕与配音都由它生成。只改每段文字，不改每段上面的 n: 标记行；一段到下一个标记行或标题为止，其中的换行与空行原样写回。显示与读法不同的词写作 {显示|读法}，⟦cue:…⟧ 是提示点，留在原来的段落中；作为文字的 \\、{、}、|、⟦、⟧ 前面加 \\。改完运行 presmium script import <文稿>。',
    scriptExported: (file, narrations, steps) => `已写出 ${steps} 个步骤的 ${narrations} 段讲稿：${file}`,
    scriptUnchanged: '讲稿没有改动，文稿保持不变。',
    scriptImported: changed => `已更新 ${[changed].flat().length} 段讲稿：${list(changed, '、')}`,
    scriptNext: document => `配音按新讲稿重新生成：presmium voiceover ${document}`,
    scriptErrors: {
      'script-duplicate': (detail, line) => `第 ${line} 行：标记 n: ${list(detail, '')} 出现了两次。每段讲稿只有一个标记。`,
      'script-stray': (detail, line) => `第 ${line} 行：“${list(detail, '')}”不在任何 n: 标记之下。讲稿写在它的标记行下面。`,
      'script-unknown': (detail, line) => `第 ${line} 行：文稿中没有 n: ${list(detail, '、')} 这些标记对应的讲稿。请从 presmium script export 写出的文件开始修改。`,
      'script-missing': detail => `文件中缺少 n: ${list(detail, '、')} 这些标记。不要删除标记行；删除讲稿请在 Presmium Studio 中进行。`,
      'script-empty': (detail, line) => `第 ${line} 行：讲稿 ${list(detail, '')} 是空的。这里不能删除一段讲稿。`,
      'script-cue-unknown': detail => `讲稿 ${[detail].flat()[0]} 中没有提示点 ⟦cue:${[detail].flat()[1]}⟧。提示点只能在原来的段落中移动，不能新增或移到别的段落。`,
      'script-cue-repeated': detail => `讲稿 ${[detail].flat()[0]} 中提示点 ⟦cue:${[detail].flat()[1]}⟧ 出现了两次。`,
      'script-cue-removed': detail => `讲稿 ${[detail].flat()[0]} 删除了提示点 ${[detail].flat().slice(1).map(cue => `⟦cue:${cue}⟧`).join('、')}。请把它们留在文字中。`,
      'script-node': detail => `讲稿中有不能写入文件的内容（${list(detail, '')}）。`,
    },
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
          --update        replace the existing skills with this version's (after upgrading Presmium)
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
  import  Markdown notes to documents (the argument is a .md file or a folder): each note becomes
          <out>/<path>/${DOCUMENT_ENTRY}, a page for each level-1 and level-2 heading; [[note]] and
          [[note|text]] find their document by file name or the aliases of the frontmatter, and
          the local files a note links to are copied into the document's attachments/; importing
          again overwrites the documents it wrote
          --out <dir>     write there (default: ., usually the workspace root)
          --exclude <name>  (repeatable) a folder or file, * allowed, whose notes are not imported
                          and whose files are not copied, e.g. raw
          --lang <tag>    the language of notes whose frontmatter has no lang (default: from the text)
          --group <n>     make the note's folder at depth n the document's first tag; the site's
                          sidebar groups documents by it, e.g. --group 2 groups projects/<project>/
  check   check the deck and run the plugins’ checks
          --json          print the result as JSON
          --update-lock   re-resolve anchors and rewrite .presmium/anchors.lock.json
          --env           also connect to the environments of execute.environments
          --audience <name>  check the content for this audience
          --external-links   also check the external links, with lychee when it is installed
  voiceover  the document’s voiceover. Without --yes it only reports what it would do: the voice
          service, the voice, and the sentences and characters without voiceover (a cloud service
          charges by the character); it generates nothing and changes no file. With --yes it generates
          the missing voiceover through the same execution as Presmium Studio, without a running
          service. Voice services and keys are read as presmium serve reads them (the workspace’s
          operator directory, PRESMIUM_SPEECH_* variables)
          --voice <service>:<voice>  first make it the document’s default voice, e.g.
                          volcengine:zh_female_tianmeitaozi_uranus_bigtts
          --yes           go ahead: generate (a voice service may charge for it) and write the changes of
                          --voice and --prune
          --prune         delete the voiceover cache that no sentence of the script uses (the files in
                          .presmium/speech/ and their speech.lock.json entries)
          --json          print the result as JSON
  script  the script as one Markdown file to polish, and back into the document
          export <deck>   write each step’s script: each paragraph below its marker line <!-- n: … --> with
                          its line breaks and blank lines, {shown|spoken} for a word shown one way and said
                          another, ⟦cue:…⟧ for a cue, and \\ before a \\, {, }, |, ⟦ or ⟧ meant as text
          import <deck> [<file>]  write the edited paragraphs back into lecture.json, changing only those;
                          nothing is written when a marker is missing or unknown, or a cue was removed
                          or moved to another paragraph
          --out <file>    where export writes (default: <deck>/dist/script.md, which import reads by default)
  speech  voice service settings
          key set [<dir>]     read a Volcengine speech API key from standard input (not echoed) and save it
                              in the workspace’s operator directory, the file of Presmium Studio’s
                              Settings → Voice Service
          key clear [<dir>]   clear the saved key
          key status [<dir>]  whether a key is configured and where it comes from, never the key; set the
                              operator directory with PRESMIUM_OPERATOR_DIR
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
          --public-url <url>  the address browsers use when a reverse proxy fronts the service: its
                          host is trusted, and previews and outputs are linked under it; with a path, the
                          proxy forwards that path unchanged and everything the service serves is below it
          --allow <kinds>    approvals given without asking: operate, spend, write, agent (by default
                          they are asked in an open Presmium window)
  mcp     MCP on stdio for AI tools such as Claude Code and Codex: relays to the running Presmium
          Studio or presmium serve of the directory, where the AI can edit documents; otherwise it
          compiles the document for reading, checking and exporting. See presmium mcp --help
  studio  Presmium Studio (experimental): the editing app in the browser and the workspace service
          of the directory (the workspace root, or a deck); prints the one address to open.
          Included with Presmium
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
    badPublicUrl: value => `“${value}” is not a usable address. Give the address browsers use, such as https://preview.example.com or https://example.com/user/a/preview/.`,
    badPort: (option, value) => `${option} takes a port number from 0 to 65535, not “${value}”.`,
    unmountFailed: error => `presmium: couldn’t close the previous server contributions: ${error}`,
    compiled: (sections, summary) => `compiled ${sections} sections; ${summary}`,
    token: file => ` (its token is in ${file})`,
    watching: ir => `watching; runtime snapshot in ${ir}`,
    serveOpen: (address, port) => `presmium serve: listening on ${address}, on the local network, with no login: anyone who reaches port ${port} uses this workspace as you (edits, runs code, approves). Use it on a network you trust; without --host it listens on this machine only.`,
    newMissing: 'presmium new: create-presmium is not installed. It comes with the presmium package: run pnpm add -g @lincyaw/presmium.',
    studioMissing: 'presmium studio: Presmium Studio is not installed. It comes with Presmium: run pnpm add -g @lincyaw/presmium.',
    mcpMissing: 'presmium mcp: @lincyaw/mcp is not installed. It comes with Presmium: run pnpm add -g @lincyaw/presmium.',
    noProblems: 'no problems',
    counts: (errors, warnings, infos) => `${errors} errors, ${warnings} warnings, ${infos} infos`,
    severity: { error: 'error', warning: 'warning', info: 'info' },
    hint: text => `    hint: ${text}`,
    lock: (file, changed, anchors) => `${file} ${changed ? 'updated' : 'unchanged'} (${anchors} anchors)`,
    documentRuns: (executed, cached) => `  (code runs: ${executed} executed, ${cached} from cache)`,
    notRendered: blocks => `  (${blocks} blocks not rendered)`,
    codeRuns: (executed, cached, sandbox) => `code runs: ${executed} executed, ${cached} from cache${sandbox ? `, isolated by ${sandbox}` : ''}`,
    badGroup: value => `--group needs a whole number of 1 or more, not “${value}”.`,
    importMissing: 'No notes to import. Give a .md file or a folder, for example presmium import notes --out site.',
    imported: (documents, files, out) => `imported ${documents} documents and copied ${files} files into ${out}`,
    importUnresolved: (note, link) => `${note}: the link ${link} leads to no note or file; it is plain text now`,
    importPatterns: patterns => `the documents of presmium.workspace.yaml need:\n${patterns.map(pattern => `  - '${pattern}'`).join('\n')}`,
    badVoice: value => `--voice takes “<service>:<voice>”, such as volcengine:zh_female_tianmeitaozi_uranus_bigtts, not “${value}”.`,
    documentChanged: 'The document changed after it was read, so nothing was written. Run the command again.',
    documentInvalid: detail => `The changed document is not valid, so nothing was written: ${detail}`,
    voiceoverUnavailable: 'This document can’t generate voiceover: its plugins need @lincyaw/addon-lecture and @lincyaw/addon-speech (enabling video production in Presmium Studio adds them).',
    voiceoverLabels: { document: 'document', voice: 'voice', service: 'voice service', sentences: 'sentences', missing: 'to generate', blocked: 'unavailable', prune: 'unused audio' },
    voiceoverPlace: (page, step) => `page ${page}, step ${step}`,
    voiceoverReasons: {
      'voice-unset': 'no voice is set',
      'cue-step': 'the script moves to the next step while this page sets voices per step',
      'voice-step-binding-unavailable': 'the steps of the script changed; check the voice settings again',
      'step-binding-stale': 'the steps of the script changed; check the voice settings again',
      'speech-unavailable': 'the document has no voice service plugin',
      'voice-not-configured': 'no voice service is configured',
      'voice-engine-unknown': 'this voice service is not configured',
      'voice-engine-unsupported': 'this voice service can’t generate voiceover',
      'voice-catalog-unavailable': 'couldn’t read the voice service’s list of voices',
      'voice-unavailable': 'the voice service has no such voice for the document’s language',
      'voice-revision-changed': 'the document changed',
      'voice-source-changed': 'the document changed',
      'speech-authentication': 'the voice service rejected the key; update it with presmium speech key set',
      'speech-permission': 'the voice service denied access: check that speech synthesis 2.0 is enabled and the key’s service and voice permissions',
      'speech-quota': 'the voice service has insufficient credit or quota',
      'speech-busy': 'the voice service is at its concurrency limit; try again shortly',
      'speech-network': 'couldn’t connect to the voice service',
      'speech-empty-audio': 'the voice service returned no audio',
      'speech-invalid-request': 'the voice service rejected this script or the voice parameters',
      'speech-provider': 'the voice service can’t generate voiceover right now',
      'speech-cache-failed': 'couldn’t write the voiceover cache; check disk space and directory permissions',
    },
    voiceoverReasonOther: code => `another reason (${code})`,
    voiceoverNoVoice: 'no voiceover',
    voiceoverUnset: 'not set',
    voiceoverVoiceChange: (next, previous) => `${next} (to become the document’s default voice instead of ${previous})`,
    voiceoverVoiceDefault: voice => `${voice} (the document’s default voice)`,
    voiceoverService: (id, provider, local) => `${id} (${provider}, ${local ? 'on this machine' : 'cloud'})`,
    voiceoverServiceMissing: id => `${id} (not configured)`,
    voiceoverCounts: (total, cached, missing, skipped, blocked) => `${total}: ${cached} with voiceover, ${missing} to generate${skipped ? `, ${skipped} silent or recorded` : ''}${blocked ? `, ${blocked} unavailable` : ''}`,
    voiceoverMissing: (count, characters, voices) => `${sentences(count)}, about ${characters} characters, voice ${list(voices, ', ')}`,
    voiceoverCharges: providers => `A cloud voice service charges by the character (${list(providers, ', ')}); the voiceover is AI-generated.`,
    voiceoverLocal: 'Generated on this machine; the voiceover is AI-generated.',
    voiceoverBlocked: (count, reason, places, more) => `${count}: ${reason} (${list(places, '; ')}${more ? '; …' : ''})`,
    voiceoverPruneErrors: 'The document has errors, so the voiceover cache was not cleaned: some of the script may not have been read. Check and fix it with presmium check first.',
    voiceoverPruneUnavailable: 'The document’s voice service plugin can’t clean the voiceover cache. Update Presmium.',
    voiceoverPruneEngineUnknown: 'Some sentences name no voice service and no default one is configured, so the audio in use can’t be told apart; nothing was cleaned.',
    voiceoverPruneWould: (count, megabytes, kept) => `${entries(count)} no sentence uses (${megabytes} MB); ${kept} kept`,
    voiceoverDryRun: 'This is a preview: no voiceover was generated and no file changed. Add --yes to go ahead.',
    voiceoverNothing: 'Every sentence has its voiceover; there is nothing to do.',
    voiceoverNothingElse: 'The other sentences have their voiceover.',
    voiceoverVoiceRefused: (voice, reason) => `The default voice was not set to ${voice}: ${reason}.`,
    voiceoverVoiceSaved: voice => `the document’s default voice is now ${voice}`,
    voiceoverGenerating: (done, total) => `Generating voiceover ${done} of ${total}`,
    voiceoverCancelled: generated => `Canceled; the ${sentences(generated)} generated so far are kept.`,
    voiceoverStale: generated => `The document changed while generating, so it stopped; the ${sentences(generated)} generated so far are kept.`,
    voiceoverGenerated: generated => `Completed: ${sentences(generated)} generated`,
    voiceoverRunError: reason => `Generation failed: ${reason}`,
    voiceoverPruned: (count, megabytes) => `deleted ${entries(count)} no sentence uses (${megabytes} MB)`,
    voiceoverLeft: (missing, blocked) => `${missing + blocked === 1 ? '1 sentence still has' : `${missing + blocked} sentences still have`} no voiceover.`,
    speechUsage: 'The commands of presmium speech are key set, key clear, and key status, for example presmium speech key status.',
    speechKeyLabels: { workspace: 'workspace', key: 'speech key', file: 'file' },
    speechKeySaved: appId => `configured, saved on this machine${appId ? ' with an App ID' : ''}; service permissions are verified when voiceover is generated`,
    speechKeyEnvironment: variable => `configured, from the environment variable ${variable}`,
    speechKeyNone: variable => `not configured; save one with presmium speech key set, or set the environment variable ${variable}`,
    speechKeyPrompt: 'Volcengine speech API key (not shown as you type): ',
    speechKeyCancelled: 'Canceled; no key was saved.',
    speechKeyEmpty: 'No key was read. Type it at the prompt, or pass it on standard input, for example presmium speech key set < key.txt.',
    speechKeyStored: file => `saved the Volcengine speech key in ${file}. A running Presmium Studio or presmium serve uses it without a restart.`,
    speechKeyCleared: 'cleared the key saved on this machine',
    speechKeyClearedEnvironment: variable => `cleared the key saved on this machine; the key in the environment variable ${variable} is used now`,
    speechKeyErrors: {
      'speech-settings-conflict': () => 'The voice service settings changed elsewhere. Run the command again.',
      'speech-settings-invalid': () => 'The key is not valid: it takes 8 to 8192 visible characters without spaces.',
      'speech-settings-busy': () => 'The voice service settings are being updated. Try again shortly.',
      'speech-settings-unavailable': file => `Couldn’t read or write the voice service settings: ${file}`,
    },
    scriptUsage: 'Usage: presmium script export <document> [--out <file>], or presmium script import <document> [<file>].',
    scriptInstructions: 'Script: the captions and the voiceover are made from it. Edit only the paragraphs; keep the n: line above each. A paragraph runs to the next n: line or heading, and its line breaks and blank lines are kept. A word shown one way and said another is written {shown|spoken}; ⟦cue:…⟧ marks a cue and stays in its paragraph. Put \\ before a \\, {, }, |, ⟦ or ⟧ meant as text. Then run presmium script import <document>.',
    scriptExported: (file, narrations, steps) => `wrote the script of ${steps} steps (${narrations} paragraphs) to ${file}`,
    scriptUnchanged: 'The script has no changes; the document is unchanged.',
    scriptImported: changed => `updated ${[changed].flat().length} ${[changed].flat().length === 1 ? 'paragraph' : 'paragraphs'} of the script: ${list(changed, ', ')}`,
    scriptNext: document => `regenerate the voiceover for the new script: presmium voiceover ${document}`,
    scriptErrors: {
      'script-duplicate': (detail, line) => `line ${line}: the marker n: ${list(detail, '')} appears twice. Each paragraph has one marker.`,
      'script-stray': (detail, line) => `line ${line}: “${list(detail, '')}” is under no n: marker. Write the script below its marker line.`,
      'script-unknown': (detail, line) => `line ${line}: the document has no script for the markers n: ${list(detail, ', ')}. Start from the file presmium script export writes.`,
      'script-missing': detail => `The file lacks the markers n: ${list(detail, ', ')}. Keep every marker line; delete script in Presmium Studio.`,
      'script-empty': (detail, line) => `line ${line}: the script ${list(detail, '')} is empty; a paragraph can’t be removed here.`,
      'script-cue-unknown': detail => `The script ${[detail].flat()[0]} has no cue ⟦cue:${[detail].flat()[1]}⟧. A cue can move only within its paragraph; it can’t be added or moved to another one.`,
      'script-cue-repeated': detail => `The cue ⟦cue:${[detail].flat()[1]}⟧ appears twice in the script ${[detail].flat()[0]}.`,
      'script-cue-removed': detail => `The script ${[detail].flat()[0]} lost the cues ${[detail].flat().slice(1).map(cue => `⟦cue:${cue}⟧`).join(', ')}. Keep them in the text.`,
      'script-node': detail => `The script holds content that can’t be written to the file (${list(detail, '')}).`,
    },
  },
}

