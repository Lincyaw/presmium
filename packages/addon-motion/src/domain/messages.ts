import type { Locale } from '@lincyaw/kernel/contracts'

export interface MotionMessages {
  steps: string
  jump(step: number): string
  loading: string
  missing(scene: string): string
  failed(scene: string, reason: string): string
  play: string
  pause: string
  scrub: string
  defaultExport: string
  scenePath: string
}

export const MOTION_MESSAGES: Record<Locale, MotionMessages> = {
  'zh-CN': {
    steps: '动画步骤',
    jump: step => `跳到动画第 ${step} 步`,
    loading: '正在加载动画…',
    missing: scene => `文稿的 scenes/ 中没有动画 ${scene}`,
    failed: (scene, reason) => `无法播放动画 ${scene}：${reason}`,
    play: '播放动画',
    pause: '暂停动画',
    scrub: '动画进度',
    defaultExport: '动画场景文件必须提供默认导出。',
    scenePath: '动画场景必须使用 scenes/ 下支持的文件格式。',
  },
  en: {
    steps: 'Animation steps',
    jump: step => `Jump to Animation Step ${step}`,
    loading: 'Loading the animation…',
    missing: scene => `The document’s scenes/ has no animation ${scene}`,
    failed: (scene, reason) => `Couldn’t play the animation ${scene}: ${reason}`,
    play: 'Play Animation',
    pause: 'Pause Animation',
    scrub: 'Animation progress',
    defaultExport: 'Motion scene files require their default export.',
    scenePath: 'A motion scene must use a supported file below scenes/.',
  },
}
