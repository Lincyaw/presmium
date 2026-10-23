import type { Locale } from '@lincyaw/kernel/contracts'

export interface MotionMessages {
  loading: string
  missing(scene: string): string
  failed(scene: string, reason: string): string
  play: string
  pause: string
  scrub: string
}

export const MOTION_MESSAGES: Record<Locale, MotionMessages> = {
  'zh-CN': {
    loading: '正在载入动画……',
    missing: scene => `文稿的 scenes/ 中没有动画 ${scene}`,
    failed: (scene, reason) => `动画 ${scene} 出错：${reason}`,
    play: '播放动画',
    pause: '暂停动画',
    scrub: '动画进度',
  },
  en: {
    loading: 'Loading the animation…',
    missing: scene => `The deck's scenes/ has no scene ${scene}`,
    failed: (scene, reason) => `The scene ${scene} failed: ${reason}`,
    play: 'Play the animation',
    pause: 'Pause the animation',
    scrub: 'Animation progress',
  },
}
