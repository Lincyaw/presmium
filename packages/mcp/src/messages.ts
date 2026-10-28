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

/** Author-readable text for failure codes an agent relays, in the document's language. */
export const MCP_ERROR_TEXT: Record<Locale, Record<string, (detail: Detail) => string>> = {
  'zh-CN': {
    'workspace-file-missing': detail => `找不到文件「${path(detail)}」，请检查路径或先把文件放进工作区。`,
    'workspace-file-forbidden': detail => `「${path(detail)}」不属于这份文稿，不能在这里使用。`,
    'workspace-file-irregular': detail => `「${path(detail)}」不是工作区中的普通文件（可能是链接或文件夹）。`,
    'workspace-path-invalid': detail => `「${path(detail)}」不是有效的工作区路径。`,
    'history-target-changed': detail => `版本历史已变化：${detail.revision} 不再是下一个可${which(detail, true)}的更改。请重新读取历史后再试。`,
    'history-revert-outside-documents': detail => `这一更改涉及文稿之外的文件（${paths(detail)}），只有工作区所有者可以撤消。`,
  },
  en: {
    'workspace-file-missing': detail => `There is no file “${path(detail)}”. Check the path, or put the file in the workspace first.`,
    'workspace-file-forbidden': detail => `“${path(detail)}” does not belong to this document and cannot be used here.`,
    'workspace-file-irregular': detail => `“${path(detail)}” is not a regular file of the workspace (it may be a link or a folder).`,
    'workspace-path-invalid': detail => `“${path(detail)}” is not a valid workspace path.`,
    'history-target-changed': detail => `The version history changed: ${detail.revision} is no longer the next change to ${which(detail, false)}. Read the history again and retry.`,
    'history-revert-outside-documents': detail => `This change touches files outside the documents (${paths(detail)}); only the workspace owner can undo it.`,
  },
}
