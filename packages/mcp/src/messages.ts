export { systemLocale } from '@lincyaw/kernel/node'
import { DOCUMENT_ENTRY } from '@lincyaw/kernel'
import type { DocumentChange, Locale, TeachingDocument } from '@lincyaw/kernel'

export interface McpMessages {
  navigate(section: string, step: number): string
  run(section: string, block: string): string
  build(renderers: string): string
  cancelBuild(target: string): string
  adoptRecording(step: string): string
  importAudio(file: string): string
  importImage(file: string): string
  generateVoiceover(scope: string): string
  cancelVoiceover(target: string): string
  previewVoice(voice: string): string
  cloneVoice(voice: string): string
  changeSpeechSettings: string
  editSource: string
  changeReview(action: 'accept' | 'reject' | 'restore'): string
  changeMediaClip(action: 'add' | 'update' | 'remove', clipId: string): string
  historyChange(which: 'undo' | 'redo' | 'revert', revision: string): string
  authoringClientAction(action: string): string
  projectChange: string
  duplicatePage: string
  applyPagePlan: string
  applyAuthoringAction: string
  applyDocumentChange: string
  startTranscription: string
  cancelTranscription: string
  adoptTranscription: string
  renderers(ids: readonly string[]): string
  classroomStart(name: string): string
  classroomEnd: string
  tool(name: string): string
  change: {
    at(page: number, title: string, what: string): string
    what: Record<'text' | 'image' | 'code' | 'component' | 'container' | 'insert' | 'move' | 'delete' | 'update' | 'section' | 'step' | 'script' | 'timing' | 'asset', string>
    document: string
    files(count: number): string
    more(count: number): string
    join: string
    none: string
  }
  detail(member: string): string
  noWindow: string
  windowClosed: string
  noPresentingWindow: string
}

// Approval titles name a command (glossary: verb phrases in zh-CN, Title Case in en); identifiers such as step,
// block, clip, and version ids stay in the approval's detail, not in its title.
export const MCP_MESSAGES: Record<Locale, McpMessages> = {
  'zh-CN': {
    navigate: (section, step) => `放映跳转到“${section}”${step > 0 ? `第 ${step} 步` : ''}`,
    run: section => `运行“${section}”中的代码`,
    build: renderers => `导出文稿（${renderers}）`,
    cancelBuild: target => `取消导出（${target}）`,
    adoptRecording: () => '将录音用作配音',
    importAudio: file => `导入音频“${file}”`,
    importImage: file => `导入图片“${file}”`,
    generateVoiceover: scope => `生成配音（${scope}）`,
    cancelVoiceover: () => '取消生成配音',
    previewVoice: voice => `试听音色“${voice}”`,
    cloneVoice: voice => `训练音色“${voice}”`,
    changeSpeechSettings: '修改语音服务设置',
    editSource: '保存文件',
    changeReview: action => action === 'accept' ? '接受工作区修改' : action === 'reject' ? '拒绝工作区修改' : '恢复审阅步骤',
    changeMediaClip: action => action === 'add' ? '添加音频片段' : action === 'update' ? '调整音频片段' : '删除音频片段',
    historyChange: which => which === 'undo' ? '撤消上一次修改' : which === 'redo' ? '恢复上一次撤消的修改' : '撤消版本历史中的一项修改',
    authoringClientAction: () => '在编辑器中执行操作',
    projectChange: '更改工作区',
    duplicatePage: '复制页面',
    applyPagePlan: '应用页面修改',
    applyAuthoringAction: '应用文稿操作',
    applyDocumentChange: '应用文稿修改',
    startTranscription: '转写录音',
    cancelTranscription: '取消转写',
    adoptTranscription: '采用转写文本',
    renderers: ids => ids.length ? ids.map(id => ({ web: '网站', slides: '幻灯片', notebook: 'Notebook', lecture: '讲授' } as Record<string, string>)[id] ?? id).join('、') : '全部形态',
    classroomStart: name => `开始课堂${name ? `“${name}”` : ''}`,
    classroomEnd: '结束课堂',
    tool: name => `使用工具“${name}”`,
    change: {
      at: (page, title, what) => `第 ${page} 页${title ? `“${title}”` : ''}：${what}`,
      what: { text: '插入文字', image: '插入图片', code: '插入代码', component: '插入组件', container: '插入分栏或标签页', insert: '插入内容块', move: '移动内容块', delete: '删除内容块', update: '修改文字', section: '修改页面标题或版式', step: '修改步骤的显示', script: '修改讲稿', timing: '修改时间', asset: '替换素材' },
      document: '整份文稿将被替换',
      files: count => `修改 ${count} 个代码或素材文件`,
      more: count => `另有 ${count} 项修改`,
      join: '；',
      none: '没有修改',
    },
    detail: member => `由 AI 代 ${member} 请求`,
    noWindow: '无法跳转：你没有打开这份文稿的窗口。请先打开文稿。',
    windowClosed: '无法跳转：显示这份文稿的窗口已关闭。请重新打开文稿后重试。',
    noPresentingWindow: '无法更改课堂：你没有正在放映这份文稿的窗口。请先放映，或打开演示者视图。',
  },
  'en': {
    navigate: (section, step) => `Move the Presentation to “${section}”${step > 0 ? `, Step ${step}` : ''}`,
    run: section => `Run Code in “${section}”`,
    build: renderers => `Export Document (${renderers})`,
    cancelBuild: target => `Cancel Export (${target})`,
    adoptRecording: () => 'Use Recording as Voiceover',
    importAudio: file => `Import Audio “${file}”`,
    importImage: file => `Import Picture “${file}”`,
    generateVoiceover: scope => `Generate Voiceover (${scope})`,
    cancelVoiceover: () => 'Cancel Voiceover',
    previewVoice: voice => `Preview Voice “${voice}”`,
    cloneVoice: voice => `Train Cloned Voice “${voice}”`,
    changeSpeechSettings: 'Change Speech Settings',
    editSource: 'Save File',
    changeReview: action => action === 'accept' ? 'Accept Workspace Changes' : action === 'reject' ? 'Reject Workspace Changes' : 'Restore Review Step',
    changeMediaClip: action => action === 'add' ? 'Add Audio Clip' : action === 'update' ? 'Adjust Audio Clip' : 'Delete Audio Clip',
    historyChange: which => which === 'undo' ? 'Undo Last Change' : which === 'redo' ? 'Redo Last Change' : 'Undo a Change from Version History',
    authoringClientAction: () => 'Perform Editor Action',
    projectChange: 'Change Workspace',
    duplicatePage: 'Duplicate Page',
    applyPagePlan: 'Apply Page Change',
    applyAuthoringAction: 'Apply Document Action',
    applyDocumentChange: 'Apply Document Change',
    startTranscription: 'Transcribe Recording',
    cancelTranscription: 'Cancel Transcription',
    adoptTranscription: 'Use Transcript',
    renderers: ids => ids.length ? ids.map(id => ({ web: 'Website', slides: 'Slides', notebook: 'Notebook', lecture: 'Lecture' } as Record<string, string>)[id] ?? id).join(', ') : 'all forms',
    classroomStart: name => `Start Classroom${name ? ` “${name}”` : ''}`,
    classroomEnd: 'End Classroom',
    tool: name => `Use Tool “${name}”`,
    change: {
      at: (page, title, what) => `Page ${page}${title ? ` “${title}”` : ''}: ${what}`,
      what: { text: 'insert text', image: 'insert a picture', code: 'insert code', component: 'insert a component', container: 'insert columns or tabs', insert: 'insert a block', move: 'move a block', delete: 'delete a block', update: 'change text', section: 'change the page title or layout', step: 'change what a step shows', script: 'change the script', timing: 'change the timing', asset: 'replace an asset' },
      document: 'The whole document is replaced',
      files: count => `Change ${count} ${count === 1 ? 'code or asset file' : 'code or asset files'}`,
      more: count => `and ${count} more ${count === 1 ? 'change' : 'changes'}`,
      join: '; ',
      none: 'No changes',
    },
    detail: member => `Requested by the AI for ${member}`,
    noWindow: 'Couldn’t move the presentation: none of your windows shows this document. Open it first.',
    windowClosed: 'Couldn’t move the presentation: the windows showing this document closed. Open it again and retry.',
    noPresentingWindow: 'Couldn’t change the classroom: none of your windows presents this document. Present it, or open Presenter View, first.',
  },
}

export interface McpCliMessages {
  usage: string
  unexpectedArgument(argument: string): string
  badAllow(kinds: readonly string[], value: string): string
  notFound(entry: string): string
  bridging(url: string): string
  unreachable: string
  missingTool: string
  unexpectedToolArgument(argument: string): string
  unknownTool(tool: string): string
  badToolArguments(value: string): string
  noService: string
  saved(file: string): string
  notSaved(count: number): string
}

export const MCP_CLI_MESSAGES: Record<Locale, McpCliMessages> = {
  'zh-CN': {
    usage: `用法：presmium mcp [<目录>] [--allow <种类>]
      presmium mcp tools [<工具>] [--json] [--all] [--schema]
      presmium mcp call <工具> [<JSON 参数>] [--out <目录>]

经标准输入输出向 Claude Code、Codex 等 AI 工具提供 MCP 服务（<目录> 是工作区的根目录、
含有 ${DOCUMENT_ENTRY} 的目录或这个文件本身；默认为 .；名为 tools 或 call 的目录写作 ./tools、
./call）。这个目录（或它所在的工作区）的 Presmium Studio 或 presmium serve 正在运行时转接到它，
AI 可以修改文稿、查看版本历史和生成配音，它重新启动后自动跟上；没有运行时只编译这份文稿，提供
阅读、检查、运行代码与导出。

tools 与 call 在命令行中使用当前目录正在运行的 Presmium 服务的工具，与 AI 经 presmium mcp
得到的相同：tools 默认列出常用工具，--all 列出完整目录；tools <工具> 返回自动生成的参数摘要，
--schema 返回完整参数格式，--json 输出 JSON。定义均直接来自服务端；call 调用一个工具，参数是一个 JSON 对象
（默认为 {}），结果以 JSON 写到标准输出。工具返回的图片（capture_slides、capture_reading、
capture_overview）用 --out 保存为 PNG 文件，路径写到标准错误。读取以外的操作与 AI 的请求一样，
由服务端按访问权限决定是否确认；本地作者的访问令牌已经允许文稿编辑。工具失败时退出码为 1，用法错误
或服务不可达时为 2。

  --allow <种类>  只编译时提供并允许这些操作：operate（run_code、build）、spend
  --out <目录>    call：把工具返回的图片保存到这个目录
  --json          tools：以 JSON 输出工具与参数摘要
  --all           tools：列出完整工具目录
  --schema        tools：输出完整参数格式
  -h, --help      显示本说明`,
    unexpectedArgument: argument => `多余的参数“${argument}”。presmium mcp 只接受一个目录。`,
    badAllow: (kinds, value) => `--allow 不接受“${value}”。可用的种类：${kinds.join('、')}。`,
    notFound: entry => `找不到 ${entry}。请检查路径，或用 presmium new 新建文稿。`,
    bridging: url => `presmium mcp: 转接到正在运行的 Presmium 服务 ${url}`,
    unreachable: 'Presmium 服务已停止。请重新启动 presmium studio 或 presmium serve，然后重试。',
    missingTool: '缺少工具名。请在 presmium mcp call 之后给出工具名；presmium mcp tools 列出全部工具。',
    unexpectedToolArgument: argument => `多余的参数“${argument}”。presmium mcp call 接受工具名与一个 JSON 对象，presmium mcp tools 接受一个工具名与 --json、--all、--schema。`,
    unknownTool: tool => `当前服务没有工具“${tool}”。用 presmium mcp tools 查看可用工具。`,
    badToolArguments: value => `参数“${value}”不是 JSON 对象。请把参数写成一个 JSON 对象，用单引号括起。`,
    noService: '无法使用工具：当前目录（或它所在的工作区）没有正在运行的 Presmium Studio 或 presmium serve。请先启动其中一个，然后重试。',
    saved: file => `已保存 ${file}`,
    notSaved: count => `结果中有 ${count} 张图片，没有保存：加 --out <目录> 保存为 PNG 文件。`,
  },
  'en': {
    usage: `Usage: presmium mcp [directory] [--allow <kinds>]
       presmium mcp tools [tool] [--json] [--all] [--schema]
       presmium mcp call <tool> [<JSON arguments>] [--out <dir>]

Serves MCP on stdio for AI tools such as Claude Code and Codex (the directory is a workspace root,
a directory holding ${DOCUMENT_ENTRY}, or that entry file; default: .; write a directory named tools
or call as ./tools or ./call). When the Presmium Studio or presmium serve of the directory (or of its
workspace) runs, it relays to it: the AI can edit documents, read their history and generate
voiceover, and it follows the service when it starts again. Otherwise it compiles the document
itself, for reading, checking, running code and exporting.

tools and call use the tools of the Presmium service running for the current directory from the
command line. tools lists the common tools; --all lists the complete catalog. tools <tool> returns
automatically generated argument summaries; --schema returns complete input schemas, and --json
outputs JSON. Definitions come directly from the server. call calls one tool with a JSON object of arguments (default: {}) and writes its result
as JSON to standard output. The pictures a tool returns (capture_slides, capture_reading,
capture_overview) are saved as PNG files with --out, and their paths written to standard error.
The server decides confirmation from access rights; the local author's access token already authorizes
document editing. The exit code is 1 when the tool fails, and 2 on a
usage error or when the service can’t be reached.

  --allow <kinds>  when compiling itself, offer and allow these operations: operate (run_code, build), spend
  --out <dir>      call: save the pictures the tool returns in this directory
  --json          tools: output tool and argument summaries as JSON
  --all           tools: list the complete tool catalog
  --schema        tools: output complete input schemas
  -h, --help       show this help`,
    unexpectedArgument: argument => `Unexpected argument “${argument}”. presmium mcp takes one directory.`,
    badAllow: (kinds, value) => `--allow does not take “${value}”. The kinds are ${kinds.join(', ')}.`,
    notFound: entry => `Couldn’t find ${entry}. Check the path, or make a document with presmium new.`,
    bridging: url => `presmium mcp: relaying to the running Presmium service at ${url}`,
    unreachable: 'The Presmium service stopped. Start presmium studio or presmium serve again, then retry.',
    missingTool: 'No tool given. Name the tool after presmium mcp call; presmium mcp tools lists them all.',
    unexpectedToolArgument: argument => `Unexpected argument “${argument}”. presmium mcp call takes a tool name and one JSON object; presmium mcp tools takes one tool name and --json, --all, --schema.`,
    unknownTool: tool => `This service has no tool named “${tool}”. Use presmium mcp tools to list available tools.`,
    badToolArguments: value => `The arguments “${value}” are not a JSON object. Write them as one JSON object, in single quotes.`,
    noService: 'Couldn’t use the tools: no Presmium Studio or presmium serve is running for this directory (or its workspace). Start one, then retry.',
    saved: file => `Saved ${file}`,
    notSaved: count => `The result has ${count} ${count === 1 ? 'picture' : 'pictures'}, not saved: add --out <dir> to save them as PNG files.`,
  },
}


type Detail = Record<string, unknown>
const path = (detail: Detail) => typeof detail.path === 'string' ? detail.path : ''
const which = (detail: Detail, zh: boolean) => detail.which === 'redo' ? zh ? '恢复' : 'redo' : zh ? '撤消' : 'undo'
const paths = (detail: Detail) => Array.isArray(detail.paths) ? detail.paths.join(', ') : ''
const list = (value: unknown, none: string) => Array.isArray(value) && value.length ? value.join(', ') : none
const kind = (detail: Detail) => typeof detail.kind === 'string' ? detail.kind : 'operate'

/**
 * Author-readable text for failure codes an agent relays, in the document's language. The code and the detail beside
 * it carry what the AI needs (tool names, fields); this text names only what the author sees.
 */
export const MCP_ERROR_TEXT: Record<Locale, Record<string, (detail: Detail) => string>> = {
  'zh-CN': {
    'operation-unavailable': () => '当前连接没有这项操作。请搜索可用操作。',
    'client-busy': () => '这个客户端正在处理另一个请求。请等待完成，或取消那个请求后再试。',
    'voice-clone-permission-denied': () => '训练和读取合成音色需要所有者权限。',
    'voice-clone-invalid': () => '音色训练的参数不完整或格式不正确。',
    'voice-clone-unavailable': () => '当前语音服务没有可用的音色训练功能。请检查服务配置。',
    'voice-clone-audio-type': () => '请选择支持的音频文件作为样本和授权声明。',
    'voice-clone-expired': () => '这次音色训练请求已过期，请重新选择样本后再开始。',
    'workspace-review-permission-denied': () => '审阅工作区修改需要未绑定文稿的所有者凭据。',
    'workspace-review-unavailable': () => '当前工作区没有可用的审阅服务。',
    'workspace-review-changed': () => '审阅内容已变化，请重新读取后决定如何处理。',
    'workspace-review-running': () => 'AI 仍在修改候选内容，请等待本轮结束后再审阅。',
    'workspace-review-not-found': () => '当前没有待审阅的修改。',
    'workspace-review-step-not-found': () => '找不到所选审阅步骤，请重新读取步骤列表。',
    'workspace-review-file-not-found': () => '所选文件没有可读取的审阅差异。',
    'workspace-review-path-changed': () => '所选文件已不在当前审阅中，请重新读取文件列表。',
    'workspace-review-diff-unavailable': () => '该文件是二进制文件或差异过大，无法返回文本差异。',
    'workspace-review-query-invalid': () => '审阅读取参数无效，请检查读取范围与分页引用。',
    'workspace-review-change-invalid': () => '审阅操作参数无效，请检查动作、步骤和确认选项。',
    'workspace-review-request-too-large': () => '审阅请求过大，请缩小所选范围。',
    'workspace-review-response-too-large': () => '所选审阅条目过大，无法在读取限额内返回。',
    'source-file-forbidden': () => '当前凭据不能访问或修改这个文本文件。',
    'source-host-unavailable': () => '当前服务没有文本编辑功能。',
    'source-file-not-found': () => '找不到所选文本文件，请先读取文件列表。',
    'source-file-exists': () => '该文件已经存在，请重新读取后再决定如何修改。',
    'source-file-too-large': () => '文件超出文本编辑器的大小限额。',
    'source-file-changed': () => '文件在读取期间变化，请重新读取。',
    'source-version-changed': () => '文件已变化，请读取当前版本后再决定如何修改。',
    'source-scope-changed': () => '文件归属或访问范围已变化，请重新读取文件列表。',
    'source-list-changed': () => '文件列表已变化，请从第一页重新读取。',
    'source-text-required': () => '此操作只支持 UTF-8 文本文件。',
    'source-request-invalid': () => '文件操作参数无效，请检查文件路径与读取范围。',
    'source-request-too-large': () => '文件请求过大，请缩小修改范围。',
    'source-response-too-large': () => '所选文件条目超出响应限额，请缩小读取范围。',
    'source-operation-failed': () => '文件操作失败，请查看诊断并重新读取文件状态。',
    'source-canonical-edit-required': () => '有效文稿请使用文稿编辑动作；文件入口只修复已有的无效文稿，不能新建文稿。',
    'source-find-not-unique': () => '待替换文字没有唯一匹配，请读取更多上下文后再修改。',
    'source-ignored-file': () => '所选文件未加入版本历史，无法保存这次修改。',
    'document-invalid': () => '文稿内容不符合格式，请查看返回的字段问题后再修复。',
    'document-identity-changed': () => '请通过新建或复制操作创建另一份文稿。',
    'speech-settings-permission-denied': () => '修改语音服务设置需要工作区所有者的权限。',
    'speech-settings-invalid': () => '语音服务设置不完整或格式不正确。请检查后重试。',
    'speech-settings-conflict': () => '语音服务设置已经变化。请重新读取后再修改。',
    'speech-settings-busy': () => '语音服务设置正在修改。请稍后重试。',
    'speech-settings-unavailable': () => '暂时无法读取或保存语音服务设置。请稍后重试。',
    'operation-name-required': () => '读取完整参数格式需要指定操作名称。',
    'editor-context-unavailable': () => '没有收到编辑器的当前页面。请指定页面和步骤，或在 Studio 中打开文稿。',
    'document-narration-text-missing': () => '讲稿中没有找到这段原文。请读取当前讲稿后重试。',
    'document-narration-text-ambiguous': () => '讲稿中有多处相同的文字。请提供更完整的原文。',
    'document-edit-request-too-large': () => '修改内容过长。请减少本次修改的内容后重试。',
    'no-such-section': () => '找不到这页。请重新读取页面列表后重试。',
    'workspace-file-missing': detail => `找不到文件“${path(detail)}”。请检查路径，或先把文件放进工作区。`,
    'workspace-file-forbidden': detail => `“${path(detail)}”不属于这份文稿，不能在这里使用。`,
    'workspace-file-irregular': detail => `“${path(detail)}”不是工作区中的普通文件（可能是链接或文件夹）。`,
    'workspace-path-invalid': detail => `“${path(detail)}”不是有效的工作区路径。`,
    'history-target-changed': detail => `无法${which(detail, true)}这项修改：版本历史已经变化。请重新打开版本历史后重试。`,
    'history-revert-outside-documents': detail => `无法撤消这项修改：它涉及文稿之外的文件（${paths(detail)}），只有工作区所有者可以撤消。`,
    'job-source-required': () => '无法导出：需要文稿当前保存的版本。请重新读取文稿后重试。',
    'job-source-unavailable': () => '无法核对文稿的版本。请不指定版本，直接导出。',
    'job-source-changed': () => '无法导出：文稿在读取之后又保存过。请重新读取文稿后重试。',
    'job-source-not-compiled': () => '无法导出：文稿刚保存的版本还没有准备好。请稍后重新读取文稿再导出。',
    'job-inputs-changed': () => '导出失败：导出期间有文件被修改。请重新导出。',
    'job-target-unknown': detail => `这份文稿不能导出为“${detail.target}”；可以导出为：${list(detail.targets, '无')}。`,
    'job-targets-empty': () => '这份文稿没有可以导出的形态。请指明要导出的形态。',
    'job-translations-invalid': () => '无法导出：文稿的译文有错误。请修正译文后重试。',
    'transcription-engine-unsupported': detail => `语音服务“${detail.engine}”不能转写录音；可以转写的语音服务：${list(detail.engines, '无')}。`,
    'transcription-engine-unknown': detail => `没有名为“${detail.engine}”的语音服务；可以转写的语音服务：${list(detail.engines, '无')}。`,
    'voice-engine-unsupported': () => '所选的语音服务不能生成配音。请在“设置 → 语音服务”中选择能生成配音的服务。',
    'voice-engine-unknown': () => '所选的语音服务没有设置。请在“设置 → 语音服务”中设置后重试。',
    'operation-not-allowed': () => '这项操作没有执行：你拒绝了它，或请求已过期。',
    'capture-unavailable': () => '这里不能拍摄幻灯片：需要 Presmium Studio 或 presmium serve 正在运行。',
    'capture-section-unknown': detail => `没有页面“${String(detail.section ?? '')}”。可以拍摄的页面：${list(detail.sections, '无')}。`,
    'capture-step-invalid': detail => `这一页没有第 ${String(detail.step ?? '')} 步；步骤从 0 到 ${String(detail.last ?? 0)}。`,
    'capture-moment-invalid': () => '时间点要是不小于 0 的毫秒数。',
    'capture-too-many-frames': detail => `一次最多拍摄 ${String(detail.max ?? '')} 张（步骤数 × 时间点数），这次要 ${String(detail.requested ?? '')} 张。请分几次拍摄。`,
    'capture-browser-unavailable': () => '无法启动用于拍摄的浏览器。请运行 pnpm exec playwright install chromium 后重试。',
    'capture-preview-failed': () => '这份文稿现在无法放映，所以无法拍摄。原因见 get_diagnostics。',
    'capture-slide-missing': () => '放映页面没有显示这一页。请稍后重试。',
    'capture-failed': () => '拍摄失败。请稍后重试；问题反复出现时查看 get_diagnostics。',
    'capture-width-invalid': detail => `窗口宽度要在 ${String(detail.min ?? 320)} 到 ${String(detail.max ?? 2560)} 像素之间。`,
    'capture-page-reloaded': () => '放映页面在退回这一步时重新加载了：倒退没有保留页面，这是放映的问题。请检查这一页的组件。',
    'approval-unavailable': detail => `这项操作需要你允许，但没有打开的 Presmium 窗口可以询问你。请在浏览器中打开 presmium studio 或 presmium serve 打印的网址后重试；也可以用 presmium serve --allow ${kind(detail)} 启动，或在 presmium.workspace.yaml 的 approvals 中允许这类操作。`,
    'authoring-review-required': () => '无法直接应用这项修改：请先接受或拒绝 AI 之前的修改。',
    'authoring-permission-denied': () => '无法应用这项修改：你没有编辑这份文稿的权限。',
  },
  'en': {
    'operation-unavailable': () => 'This connection does not offer that operation. Read the available operations.',
    'client-busy': () => 'This client is handling another request. Wait for it to finish or cancel that exact request.',
    'voice-clone-permission-denied': () => 'Training and reading cloned voices requires owner access.',
    'voice-clone-invalid': () => 'Voice cloning arguments are incomplete or invalid.',
    'voice-clone-unavailable': () => 'The current speech service has no available voice cloning capability. Check its configuration.',
    'voice-clone-audio-type': () => 'Select supported audio files for the sample and consent statement.',
    'voice-clone-expired': () => 'This voice training request expired. Select the sample again before starting.',
    'workspace-review-permission-denied': () => 'Workspace reviews require an owner credential that is not bound to a document.',
    'workspace-review-unavailable': () => 'Workspace review is unavailable.',
    'workspace-review-changed': () => 'The review changed. Read it again before deciding what to do.',
    'workspace-review-running': () => 'The AI Assistant is still changing the candidate. Wait for the turn to finish.',
    'workspace-review-not-found': () => 'There is no active review.',
    'workspace-review-step-not-found': () => 'The review step was not found. Read the steps again.',
    'workspace-review-file-not-found': () => 'The selected file has no review diff.',
    'workspace-review-path-changed': () => 'A selected file is no longer in this review. Read the file list again.',
    'workspace-review-diff-unavailable': () => 'The file is binary or its diff is too large to return as text.',
    'workspace-review-query-invalid': () => 'The review query is invalid. Check its scope and pagination reference.',
    'workspace-review-change-invalid': () => 'The review action is invalid. Check the action, step and confirmation.',
    'workspace-review-request-too-large': () => 'The review request is too large. Select a smaller scope.',
    'workspace-review-response-too-large': () => 'The selected review item exceeds the response limit.',
    'source-file-forbidden': () => 'This credential cannot access or edit this source file.',
    'source-host-unavailable': () => 'Source editing is unavailable on this host.',
    'source-file-not-found': () => 'The source file was not found. Read the file list first.',
    'source-file-exists': () => 'The file already exists. Read it before deciding how to edit it.',
    'source-file-too-large': () => 'The file exceeds the source editor size limit.',
    'source-file-changed': () => 'The file changed during the read. Read it again.',
    'source-version-changed': () => 'The file changed. Read its current version before deciding how to edit it.',
    'source-scope-changed': () => 'The file ownership or access scope changed. Read the file list again.',
    'source-list-changed': () => 'The file list changed. Read it again from the first page.',
    'source-text-required': () => 'This operation only supports UTF-8 text files.',
    'source-request-invalid': () => 'The source request is invalid. Check the file path and read range.',
    'source-request-too-large': () => 'The source request is too large. Edit a smaller scope.',
    'source-response-too-large': () => 'The selected source item exceeds the response limit. Read a smaller scope.',
    'source-operation-failed': () => 'The source operation failed. Check diagnostics and read the file state again.',
    'source-canonical-edit-required': () => 'Use document actions for valid documents. Source editing only repairs an existing invalid document; it cannot create a document.',
    'source-find-not-unique': () => 'The original text does not have exactly one match. Read more context before editing.',
    'source-ignored-file': () => 'This file is excluded from history, so this change cannot be saved.',
    'document-invalid': () => 'The document is invalid. Check the reported fields before repairing it.',
    'document-identity-changed': () => 'Use the create or copy action to make a different document.',
    'speech-settings-permission-denied': () => 'Changing speech settings requires a workspace owner credential.',
    'speech-settings-invalid': () => 'Speech settings are incomplete or invalid. Check the values and retry.',
    'speech-settings-conflict': () => 'Speech settings changed. Read the current settings before editing again.',
    'speech-settings-busy': () => 'Speech settings are being changed. Retry shortly.',
    'speech-settings-unavailable': () => 'Speech settings could not be read or saved. Retry shortly.',
    'operation-name-required': () => 'Name an operation to read its complete input schema.',
    'editor-context-unavailable': () => 'No current editor page was reported. Specify a page and step, or open the document in Studio.',
    'document-narration-text-missing': () => 'The original text was not found in this script. Read the current script and retry.',
    'document-narration-text-ambiguous': () => 'The text appears more than once. Provide a longer exact phrase.',
    'document-edit-request-too-large': () => 'This edit is too large. Reduce its content and retry.',
    'no-such-section': () => 'This page could not be found. Read the page list again and retry.',
    'workspace-file-missing': detail => `There is no file “${path(detail)}”. Check the path, or put the file in the workspace first.`,
    'workspace-file-forbidden': detail => `“${path(detail)}” does not belong to this document and can’t be used here.`,
    'workspace-file-irregular': detail => `“${path(detail)}” is not a regular file of the workspace (it may be a link or a folder).`,
    'workspace-path-invalid': detail => `“${path(detail)}” is not a valid workspace path.`,
    'history-target-changed': detail => `Couldn’t ${which(detail, false)} this change: the version history changed. Open Version History again and retry.`,
    'history-revert-outside-documents': detail => `Couldn’t undo this change: it touches files outside the documents (${paths(detail)}); only the workspace owner can undo it.`,
    'job-source-required': () => 'Couldn’t export: the document’s saved version is needed. Read the document again and retry.',
    'job-source-unavailable': () => 'Couldn’t check the document’s version. Export without naming a version.',
    'job-source-changed': () => 'Couldn’t export: the document was saved again after it was read. Read it again and retry.',
    'job-source-not-compiled': () => 'Couldn’t export: the version just saved is not ready yet. Read the document again shortly, then export.',
    'job-inputs-changed': () => 'Export failed: files changed during the export. Export again.',
    'job-target-unknown': detail => `This document can’t be exported as “${detail.target}”; it can be exported as: ${list(detail.targets, 'nothing')}.`,
    'job-targets-empty': () => 'This document has no form to export. Name the form to export.',
    'job-translations-invalid': () => 'Couldn’t export: the document’s translations have errors. Fix them and retry.',
    'transcription-engine-unsupported': detail => `The voice service “${detail.engine}” can’t transcribe recordings; voice services that can: ${list(detail.engines, 'none')}.`,
    'transcription-engine-unknown': detail => `There is no voice service “${detail.engine}”; voice services that can transcribe: ${list(detail.engines, 'none')}.`,
    'voice-engine-unsupported': () => 'The selected voice service can’t generate voiceovers. Choose one that can in Settings > Voice Service.',
    'voice-engine-unknown': () => 'The selected voice service is not set up. Set it up in Settings > Voice Service and retry.',
    'operation-not-allowed': () => 'This operation did not run: you denied it, or the request expired.',
    'capture-unavailable': () => 'Slides can’t be captured here: Presmium Studio or presmium serve must be running.',
    'capture-section-unknown': detail => `There is no page “${String(detail.section ?? '')}”. Pages that can be captured: ${list(detail.sections, 'none')}.`,
    'capture-step-invalid': detail => `This page has no step ${String(detail.step ?? '')}; its steps run from 0 to ${String(detail.last ?? 0)}.`,
    'capture-moment-invalid': () => 'Moments are milliseconds, 0 or more.',
    'capture-too-many-frames': detail => `At most ${String(detail.max ?? '')} pictures a call (steps × moments); this asks for ${String(detail.requested ?? '')}. Capture in several calls.`,
    'capture-browser-unavailable': () => 'The browser for capturing could not start. Run pnpm exec playwright install chromium and retry.',
    'capture-preview-failed': () => 'This document can’t be presented now, so it can’t be captured. get_diagnostics says why.',
    'capture-slide-missing': () => 'The presentation did not show this page. Retry shortly.',
    'capture-failed': () => 'Capturing failed. Retry shortly; if it keeps failing, read get_diagnostics.',
    'capture-width-invalid': detail => `The window width must be from ${String(detail.min ?? 320)} to ${String(detail.max ?? 2560)} pixels.`,
    'capture-page-reloaded': () => 'The presentation reloaded while going back to this step: going back did not keep the page, which is a fault of the presentation. Check this page’s components.',
    'approval-unavailable': detail => `This operation needs your approval, but no Presmium window is open to ask you. Open the address presmium studio or presmium serve printed in a browser and retry, or start presmium serve --allow ${kind(detail)}, or allow this kind of operation under approvals in presmium.workspace.yaml.`,
    'authoring-review-required': () => 'Couldn’t apply this change yet: accept or reject the AI’s earlier changes first.',
    'authoring-permission-denied': () => 'Couldn’t apply this change: you don’t have permission to edit this document.',
  },
}

/** A short, readable account of a document change for its approval: by page, what it does; no ids and no source. */
export function documentChangeSummary(t: McpMessages, change: DocumentChange, content: TeachingDocument): string {
  const pageOf = new Map<string, string>()
  const walk = (section: string, blocks: readonly string[]) => {
    for (const id of blocks) {
      pageOf.set(id, section)
      const block = content.blocks[id]
      if (block && 'children' in block && Array.isArray(block.children)) walk(section, block.children)
    }
  }
  for (const id of content.sectionOrder) walk(id, content.sections[id]?.children ?? [])
  const stepPage = (step: string | undefined) => step ? content.steps[step]?.sectionId : undefined
  const parts: string[] = []
  if (change.replacement) parts.push(t.change.document)
  const byPage = new Map<string | undefined, string[]>()
  for (const op of change.operations ?? []) {
    const [section, what] = op.type === 'insertBlock' ? [op.sectionId, t.change.what[op.block.type in t.change.what ? op.block.type as 'text' : 'insert']]
      : op.type === 'moveBlock' ? [op.sectionId, t.change.what.move]
        : op.type === 'deleteBlock' ? [pageOf.get(op.blockId), t.change.what.delete]
          : op.type === 'updateText' ? [pageOf.get(op.blockId), t.change.what.update]
            : op.type === 'updateSection' ? [op.sectionId, t.change.what.section]
              : op.type === 'setStepState' ? [stepPage(op.stepId), t.change.what.step]
                : op.type === 'setNarration' ? [stepPage(op.stepId), t.change.what.script]
                  : op.type === 'setTiming' ? [op.sectionId ?? stepPage(op.stepId), t.change.what.timing]
                    : [undefined, t.change.what.asset]
    const list = byPage.get(section) ?? []
    if (!list.includes(what)) list.push(what)
    byPage.set(section, list)
  }
  for (const [section, whats] of byPage) {
    const page = section ? content.sectionOrder.indexOf(section) + 1 : 0
    const what = whats.join(t.change.join)
    parts.push(page > 0 ? t.change.at(page, content.sections[section!]?.title ?? '', what) : what.charAt(0).toUpperCase() + what.slice(1))
  }
  if (change.fileChanges?.length) parts.push(t.change.files(change.fileChanges.length))
  if (parts.length === 0) return t.change.none
  const shown = parts.slice(0, 4)
  if (parts.length > shown.length) shown.push(t.change.more(parts.length - shown.length))
  return shown.join('\n')
}
