export const AGENT_ACTIVITY_MESSAGES = {
  'zh-CN': {
    compact: { read: '查看中', edit: '编辑中', navigate: '定位中', preview: '预览中', build: '构建中', voice: '配音中', workspace: '整理中', thinking: '思考中', done: '已完成', failed: '失败', cancelled: '已取消' },
    read: 'AI 助手正在查看', edit: 'AI 助手正在编辑', navigate: 'AI 助手正在定位', preview: 'AI 助手正在查看预览', build: 'AI 助手正在构建', voice: 'AI 助手正在处理配音', workspace: 'AI 助手正在整理工作区', thinking: 'AI 助手正在思考',
    done: 'AI 助手已完成', failed: 'AI 助手操作失败', cancelled: 'AI 助手已取消', following: '正在跟随', resume: '跟随 AI 助手', paused: '跟随已暂停',
    followLabel: '跟随 AI 助手的操作位置', pauseLabel: '暂停跟随 AI 助手', concurrent: (count: number) => `${count} 项操作进行中`,
  },
  en: {
    compact: { read: 'Reading', edit: 'Editing', navigate: 'Locating', preview: 'Previewing', build: 'Building', voice: 'Voicing', workspace: 'Organizing', thinking: 'Thinking', done: 'Done', failed: 'Failed', cancelled: 'Canceled' },
    read: 'AI Assistant is reading', edit: 'AI Assistant is editing', navigate: 'AI Assistant is navigating', preview: 'AI Assistant is inspecting the preview', build: 'AI Assistant is building', voice: 'AI Assistant is working on voiceover', workspace: 'AI Assistant is updating the workspace', thinking: 'AI Assistant is thinking',
    done: 'AI Assistant finished', failed: 'AI Assistant operation failed', cancelled: 'AI Assistant canceled', following: 'Following', resume: 'Follow AI Assistant', paused: 'Following paused',
    followLabel: 'Follow the AI Assistant’s location', pauseLabel: 'Pause following the AI Assistant', concurrent: (count: number) => `${count} operations running`,
  },
}
