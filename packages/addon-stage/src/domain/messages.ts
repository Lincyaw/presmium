import type { Locale } from '@lincyaw/kernel/contracts'

const zh = {
  badge: { black: '听众视图已黑屏', frozen: '听众视图已冻结' },
  pen: { draw: '画笔', ink: (n: number) => `墨水 ${n}`, eraser: '橡皮', undo: '撤销', clear: '清除', done: '完成' },
}

export type StageMessages = typeof zh

const en: StageMessages = {
  badge: { black: 'Audience view blacked out', frozen: 'Audience view frozen' },
  pen: { draw: 'Pen', ink: (n: number) => `Ink ${n}`, eraser: 'Eraser', undo: 'Undo', clear: 'Clear', done: 'Done' },
}

export const MESSAGES: Record<Locale, StageMessages> = { 'zh-CN': zh, 'en': en }
