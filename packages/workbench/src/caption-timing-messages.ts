export const CAPTION_TIMING_MESSAGES = {
  'zh-CN': {
    title: '手动字幕时间', open: '设置字幕时间', cancel: '取消', done: '完成', apply: '应用', automatic: '恢复自动', split: '按换行分段',
    start: '开始（秒）', end: '结束（秒）', step: '本步骤 · 时间从步骤起点计算', invalid: '时间须递增且不超出本步骤。',
    loading: '正在读取字幕时间…', prepare: '请先准备当前步骤。', unavailable: '当前步骤的字幕时间不可用。', changed: '讲稿或音频已变化。', recheck: '重新检查', saved: '已保存。',
    failed: '字幕时间未确认，输入已保留。', limit: '本次最多设置 32 段。', segment: (n: number) => `字幕 ${n}`,
  },
  en: {
    title: 'Manual caption timing', open: 'Set caption times', cancel: 'Cancel', done: 'Done', apply: 'Apply', automatic: 'Restore automatic', split: 'Split at line breaks',
    start: 'Start (seconds)', end: 'End (seconds)', step: 'Current step · Times start at the step boundary', invalid: 'Times must increase and fit inside this step.',
    loading: 'Reading caption times…', prepare: 'Prepare the current step first.', unavailable: 'Caption timing is unavailable for this step.', changed: 'The script or audio has changed.', recheck: 'Review again', saved: 'Saved.',
    failed: 'Caption times are unconfirmed. Your input is retained.', limit: 'Set no more than 32 segments at once.', segment: (n: number) => `Caption ${n}`,
  },
}
