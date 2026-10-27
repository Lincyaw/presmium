import type { Locale } from '@lincyaw/kernel'

export interface McpMessages {
  navigate(section: string, step: number): string
  run(section: string, block: string): string
  build(renderers: string): string
  cancelBuild(target: string): string
  importAudio(file: string): string
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
    importAudio: file => `导入音频「${file}」`,
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
    importAudio: file => `Import audio “${file}”`,
    allRenderers: 'all renderers',
    classroomStart: name => `Start the classroom${name ? ` "${name}"` : ''}`,
    classroomEnd: 'End the classroom',
    tool: name => `Agent tool ${name}`,
    detail: member => `An MCP client, with a token of ${member}`,
  },
}
