import { remotionScene } from '@lincyaw/addon-motion/scene'

// A Remotion title card: the title springs in, the subtitle types itself, then both rise for the badge.
// The card is in the page, not in an iframe, so its text sets its own line heights over the page's styles.
// Remotion picks the frame from the scene's time, so `useCurrentFrame` is the step's time at 30 fps.
const SUBTITLE = '讲义 → 幻灯片 → 讲授 → 视频'

export default remotionScene(({ React, remotion, at }) => {
  const { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const frameAt = (ms: number) => Math.round(ms * fps / 1000)

  function TitleCard() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const pop = spring({ frame: frame - frameAt(at(0)), fps: rate, config: { damping: 11, stiffness: 120 } })
    const typed = Math.round(interpolate(frame, [frameAt(at(1)), frameAt(at(2)) - 6], [0, SUBTITLE.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    const rise = interpolate(frame, [frameAt(at(2)), frameAt(at(3))], [0, -70], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const badge = interpolate(frame, [frameAt(at(2)) + 6, frameAt(at(3))], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return h(AbsoluteFill, { style: { background: 'linear-gradient(135deg, #0f5f5c, #163a5f)', color: '#f7f5f0', fontFamily: 'IBM Plex Sans, sans-serif', alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { transform: `translateY(${rise}px)`, textAlign: 'center' } },
        h('h1', { style: { margin: 0, fontSize: 140, lineHeight: 1.1, letterSpacing: -2, color: 'inherit', transform: `scale(${pop})` } }, 'Presmium'),
        h('p', { style: { margin: '24px 0 0', fontSize: 48, lineHeight: 1.3, minHeight: 63, opacity: 0.9 } }, SUBTITLE.slice(0, typed))),
      h('div', { style: { position: 'absolute', bottom: 120, padding: '14px 36px', borderRadius: 999, background: '#f2b705', color: '#1c1b19', fontSize: 40, opacity: badge, transform: `translateY(${(1 - badge) * 30}px)` } }, '每一帧都由时间决定'))
  }

  return { component: TitleCard, fps, width: 1280, height: 720 }
})
