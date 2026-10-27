import type { Locale } from '@lincyaw/kernel'

export interface McpMessages {
  navigate(section: string, step: number): string
  run(section: string, block: string): string
  build(renderers: string): string
  cancelBuild(target: string): string
  adoptRecording(step: string): string
  importAudio(file: string): string
  generateVoiceover(scope: string): string
  cancelVoiceover(target: string): string
  previewVoice(voice: string): string
  changeMediaClip(action: 'add' | 'update' | 'remove', clipId: string): string
  historyChange(which: 'undo' | 'redo' | 'revert', revision: string): string
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
    generateVoiceover: scope => `生成配音「${scope}」`,
    cancelVoiceover: target => `取消配音「${target}」`,
    previewVoice: voice => `试听音色「${voice}」`,
    changeMediaClip: (action, clipId) => `${{ add: '添加', update: '调整', remove: '删除' }[action]}音频片段「${clipId}」`,
    historyChange: (which, revision) => `${which === 'redo' ? '重做' : which === 'revert' ? '撤消指定' : '撤消'}文稿修改 ${revision}`,
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
    generateVoiceover: scope => `Generate voiceover “${scope}”`,
    cancelVoiceover: target => `Cancel voiceover “${target}”`,
    previewVoice: voice => `Preview voice “${voice}”`,
    changeMediaClip: (action, clipId) => `${{ add: 'Add', update: 'Update', remove: 'Remove' }[action]} audio clip “${clipId}”`,
    historyChange: (which, revision) => `${which === 'undo' ? 'Undo' : which === 'redo' ? 'Redo' : 'Revert'} document change ${revision}`,
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
