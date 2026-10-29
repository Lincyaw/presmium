export const CAPTION_TIMING_MESSAGES = {
  'zh-CN': {
    title: '手动字幕时间', open: '设置字幕时间', cancel: '取消', done: '完成', apply: '应用', automatic: '使用自动时间', split: '按换行分段',
    start: '开始（秒）', end: '结束（秒）', step: '本步骤 · 时间从步骤起点计算', invalid: '时间须递增且不超出本步骤。',
    loading: '正在加载字幕时间…', prepare: '请先准备当前步骤。', unavailable: '当前步骤的字幕时间不可用。', changed: '讲稿或音频已变化。', recheck: '再次检查', saved: '字幕时间已保存到当前步骤。',
    failed: '无法确认字幕时间已保存。输入已保留，请重试。', storageFailed: '无法备份字幕时间，请保持此页面打开。', discard: '放弃修改', limit: '本次最多设置 32 段。', segment: (n: number) => `字幕 ${n}`,
  },
  en: {
    title: 'Manual Caption Timing', open: 'Set Caption Times', cancel: 'Cancel', done: 'Done', apply: 'Apply', automatic: 'Use Automatic Times', split: 'Split at Line Breaks',
    start: 'Start (seconds)', end: 'End (seconds)', step: 'Current step · Times start at the step boundary', invalid: 'Times must increase and fit inside this step.',
    loading: 'Loading caption times…', prepare: 'Prepare the current step first.', unavailable: 'Caption timing is unavailable for this step.', changed: 'The script or audio has changed.', recheck: 'Check Again', saved: 'Caption times saved to this step.',
    failed: 'Couldn’t confirm that caption times were saved. Your input is kept; try again.', storageFailed: 'Couldn’t back up caption times. Keep this page open.', discard: 'Discard Changes', limit: 'Set no more than 32 segments at once.', segment: (n: number) => `Caption ${n}`,
  },
}
