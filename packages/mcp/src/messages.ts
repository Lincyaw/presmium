import { DOCUMENT_ENTRY } from '@lincyaw/kernel'
import type { Locale } from '@lincyaw/kernel'

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
    changeMediaClip: action => action === 'add' ? '添加音频片段' : action === 'update' ? '调整音频片段' : '移除音频片段',
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
    changeMediaClip: action => action === 'add' ? 'Add Audio Clip' : action === 'update' ? 'Adjust Audio Clip' : 'Remove Audio Clip',
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
}

export const MCP_CLI_MESSAGES: Record<Locale, McpCliMessages> = {
  'zh-CN': {
    usage: `用法：presmium-mcp [<文稿>] [--allow <种类>]

经标准输入输出向编辑器中的 AI 提供这份文稿（含有 ${DOCUMENT_ENTRY} 的目录或这个文件本身；默认为 .）的
工具与资源。

  --allow <种类>  提供并允许这些操作：operate（run_code、build）、spend
  -h, --help      显示本说明`,
    unexpectedArgument: argument => `多余的参数“${argument}”。presmium-mcp 只接受一份文稿。`,
    badAllow: (kinds, value) => `--allow 不接受“${value}”。可用的种类：${kinds.join('、')}。`,
    notFound: entry => `找不到 ${entry}。请检查路径，或用 presmium new 新建文稿。`,
  },
  'en': {
    usage: `Usage: presmium-mcp [deck] [--allow <kinds>]

Serves the document (a directory holding ${DOCUMENT_ENTRY}, or that entry file; default: .)
as tools and resources on stdio, for the AI of an editor.

  --allow <kinds>  offer and allow these operations: operate (run_code, build), spend
  -h, --help       show this help`,
    unexpectedArgument: argument => `Unexpected argument “${argument}”. presmium-mcp serves one deck.`,
    badAllow: (kinds, value) => `--allow does not take “${value}”. The kinds are ${kinds.join(', ')}.`,
    notFound: entry => `Couldn’t find ${entry}. Check the path, or make a document with presmium new.`,
  },
}

/** The language of command-line output: the system's (`LC_ALL`, `LC_MESSAGES`, `LANG`), as `create-presmium` chooses it. */
export function systemLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const tag = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  return /^zh/i.test(tag) ? 'zh-CN' : 'en'
}

type Detail = Record<string, unknown>
const path = (detail: Detail) => typeof detail.path === 'string' ? detail.path : ''
const which = (detail: Detail, zh: boolean) => detail.which === 'redo' ? zh ? '恢复' : 'redo' : zh ? '撤消' : 'undo'
const paths = (detail: Detail) => Array.isArray(detail.paths) ? detail.paths.join(', ') : ''
const list = (value: unknown, none: string) => Array.isArray(value) && value.length ? value.join(', ') : none

/**
 * Author-readable text for failure codes an agent relays, in the document's language. The code and the detail beside
 * it carry what the AI needs (tool names, fields); this text names only what the author sees.
 */
export const MCP_ERROR_TEXT: Record<Locale, Record<string, (detail: Detail) => string>> = {
  'zh-CN': {
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
    'authoring-review-required': () => '无法直接应用这项修改：请先接受或拒绝 AI 之前的修改。',
    'authoring-permission-denied': () => '无法应用这项修改：你没有编辑这份文稿的权限。',
  },
  'en': {
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
    'authoring-review-required': () => 'Couldn’t apply this change yet: accept or reject the AI’s earlier changes first.',
    'authoring-permission-denied': () => 'Couldn’t apply this change: you don’t have permission to edit this document.',
  },
}
