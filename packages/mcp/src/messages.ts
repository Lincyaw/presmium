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
  allRenderers: string
  classroomStart(name: string): string
  classroomEnd: string
  tool(name: string): string
  detail(member: string): string
}

export const MCP_MESSAGES: Record<Locale, McpMessages> = {
  'zh-CN': {
    navigate: (section, step) => `放映跳转到「${section}」${step > 0 ? `第 ${step} 步` : ''}`,
    run: (section, block) => `运行「${section}」一节的 ${block}`,
    build: renderers => `构建文稿（${renderers}）`,
    cancelBuild: target => `取消构建（${target}）`,
    adoptRecording: step => `采用录音为本步配音「${step}」`,
    importAudio: file => `导入音频「${file}」`,
    importImage: file => `导入图片「${file}」`,
    generateVoiceover: scope => `生成配音「${scope}」`,
    cancelVoiceover: target => `取消配音「${target}」`,
    previewVoice: voice => `试听音色「${voice}」`,
    changeMediaClip: (action, clipId) => `${{ add: '添加', update: '调整', remove: '删除' }[action]}音频片段「${clipId}」`,
    historyChange: (which, revision) => `${which === 'redo' ? '重做' : which === 'revert' ? '撤消指定' : '撤消'}文稿修改 ${revision}`,
    authoringClientAction: action => `请求编辑器动作 ${action}`,
    projectChange: '提交项目变更',
    duplicatePage: '复制页面',
    applyPagePlan: '采用页面预检',
    applyAuthoringAction: '采用文稿动作预检',
    allRenderers: '全部渲染端',
    classroomStart: name => `开始课堂${name ? `「${name}」` : ''}`,
    classroomEnd: '结束课堂',
    tool: name => `agent 工具 ${name}`,
    detail: member => `MCP 客户端，令牌属于 ${member}`,
  },
  'en': {
    navigate: (section, step) => `Move the presentation to "${section}"${step > 0 ? `, step ${step}` : ''}`,
    run: (section, block) => `Run ${block} of "${section}"`,
    build: renderers => `Build the deck (${renderers})`,
    cancelBuild: target => `Cancel build (${target})`,
    adoptRecording: step => `Use recording for step “${step}”`,
    importAudio: file => `Import audio “${file}”`,
    importImage: file => `Import image “${file}”`,
    generateVoiceover: scope => `Generate voiceover “${scope}”`,
    cancelVoiceover: target => `Cancel voiceover “${target}”`,
    previewVoice: voice => `Preview voice “${voice}”`,
    changeMediaClip: (action, clipId) => `${{ add: 'Add', update: 'Update', remove: 'Remove' }[action]} audio clip “${clipId}”`,
    historyChange: (which, revision) => `${which === 'undo' ? 'Undo' : which === 'redo' ? 'Redo' : 'Revert'} document change ${revision}`,
    authoringClientAction: action => `Request editor action ${action}`,
    projectChange: 'Apply project change',
    duplicatePage: 'Duplicate page',
    applyPagePlan: 'Apply page plan',
    applyAuthoringAction: 'Apply authoring action plan',
    allRenderers: 'all renderers',
    classroomStart: name => `Start the classroom${name ? ` "${name}"` : ''}`,
    classroomEnd: 'End the classroom',
    tool: name => `Agent tool ${name}`,
    detail: member => `An MCP client, with a token of ${member}`,
  },
}

type Detail = Record<string, unknown>
const path = (detail: Detail) => typeof detail.path === 'string' ? detail.path : ''
const which = (detail: Detail, zh: boolean) => detail.which === 'redo' ? zh ? '恢复' : 'redo' : zh ? '撤消' : 'undo'
const paths = (detail: Detail) => Array.isArray(detail.paths) ? detail.paths.join(', ') : ''
const list = (value: unknown, none: string) => Array.isArray(value) && value.length ? value.join(', ') : none

/** Author-readable text for failure codes an agent relays, in the document's language. */
export const MCP_ERROR_TEXT: Record<Locale, Record<string, (detail: Detail) => string>> = {
  'zh-CN': {
    'workspace-file-missing': detail => `找不到文件「${path(detail)}」，请检查路径或先把文件放进工作区。`,
    'workspace-file-forbidden': detail => `「${path(detail)}」不属于这份文稿，不能在这里使用。`,
    'workspace-file-irregular': detail => `「${path(detail)}」不是工作区中的普通文件（可能是链接或文件夹）。`,
    'workspace-path-invalid': detail => `「${path(detail)}」不是有效的工作区路径。`,
    'history-target-changed': detail => `版本历史已变化：${detail.revision} 不再是下一个可${which(detail, true)}的更改。请重新读取历史后再试。`,
    'history-revert-outside-documents': detail => `这一更改涉及文稿之外的文件（${paths(detail)}），只有工作区所有者可以撤消。`,
    'job-source-required': () => '构建需要文稿当前保存的版本（get_document 返回的 source.version 与 source.fingerprint）。',
    'job-source-unavailable': () => '这个宿主不能核对文稿版本，请不带 source 再构建。',
    'job-source-changed': () => '文稿在读取之后又被保存过，请重新读取文稿后再构建。',
    'job-source-not-compiled': () => '文稿的保存版本还没有被编译，请稍后重新读取文稿再构建。',
    'job-inputs-changed': () => '构建用到的文件在构建期间被修改，请重新构建。',
    'job-target-unknown': detail => `这份文稿不能生成「${detail.target}」；可以生成：${list(detail.targets, '无')}。`,
    'job-targets-empty': () => '这份文稿没有可以构建的渲染端，请在 to 中指明要生成的内容。',
    'job-translations-invalid': () => '文稿的译文有错误，修正后才能构建。',
    'transcription-engine-unsupported': detail => `引擎「${detail.engine}」不能转写语音；可用于转写的引擎：${list(detail.engines, '无')}。`,
    'transcription-engine-unknown': detail => `没有名为「${detail.engine}」的语音引擎；可用于转写的引擎：${list(detail.engines, '无')}。`,
    'voice-engine-unsupported': () => '所选引擎不能合成语音，请改用能朗读的引擎（get_voice_authoring_capabilities）。',
    'voice-engine-unknown': () => '没有配置所选的语音引擎，请从 get_voice_authoring_capabilities 中选择。',
  },
  en: {
    'workspace-file-missing': detail => `There is no file “${path(detail)}”. Check the path, or put the file in the workspace first.`,
    'workspace-file-forbidden': detail => `“${path(detail)}” does not belong to this document and cannot be used here.`,
    'workspace-file-irregular': detail => `“${path(detail)}” is not a regular file of the workspace (it may be a link or a folder).`,
    'workspace-path-invalid': detail => `“${path(detail)}” is not a valid workspace path.`,
    'history-target-changed': detail => `The version history changed: ${detail.revision} is no longer the next change to ${which(detail, false)}. Read the history again and retry.`,
    'history-revert-outside-documents': detail => `This change touches files outside the documents (${paths(detail)}); only the workspace owner can undo it.`,
    'job-source-required': () => 'A build needs the document\'s saved source (source.version and source.fingerprint from get_document).',
    'job-source-unavailable': () => 'This host cannot confirm a document source; build without source.',
    'job-source-changed': () => 'The document was saved again after it was read. Read it again, then build.',
    'job-source-not-compiled': () => 'The saved document has not been compiled yet. Read it again shortly, then build.',
    'job-inputs-changed': () => 'Files the build reads changed while it ran. Build again.',
    'job-target-unknown': detail => `This document cannot be made into “${detail.target}”; it can be made into: ${list(detail.targets, 'nothing')}.`,
    'job-targets-empty': () => 'This document has no renderer to build; name what to make in to.',
    'job-translations-invalid': () => 'The document\'s translations have errors; fix them before building.',
    'transcription-engine-unsupported': detail => `The engine “${detail.engine}” cannot transcribe speech; engines that can: ${list(detail.engines, 'none')}.`,
    'transcription-engine-unknown': detail => `There is no speech engine “${detail.engine}”; engines that can transcribe: ${list(detail.engines, 'none')}.`,
    'voice-engine-unsupported': () => 'The selected engine cannot synthesize speech; choose one that can (get_voice_authoring_capabilities).',
    'voice-engine-unknown': () => 'The selected speech engine is not configured; choose one from get_voice_authoring_capabilities.',
  },
}
