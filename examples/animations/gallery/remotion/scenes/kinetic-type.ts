import { remotionScene } from '@lincyaw/addon-motion/scene'

// Kinetic typography: each word springs in with its own delay (scale, rise and a small rotation), then one
// word "punches": interpolate over the spring's value with a multi-point range overshoots and settles.
// transform does not move the neighbours, so the punched word also grows its margin to make room.
const WORDS = ['Attention', 'is', 'all', 'you', 'need']
const PUNCH = 2

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), bg = color('bg')

  function Kinetic() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const punch = spring({ frame: frame - F(at(1)), fps: rate, config: { damping: 12, stiffness: 160 } })
    return h(AbsoluteFill, { style: { background: bg, alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--pm-font-serif)' } },
      h('div', { style: { display: 'flex', gap: 28, alignItems: 'baseline' } },
        WORDS.map((word, i) => {
          const s = spring({ frame: frame - F(at(0)), fps: rate, delay: i * 6, config: { damping: 10, stiffness: 140 } })
          const isPunch = i === PUNCH
          const scale = isPunch ? interpolate(punch, [0, 0.6, 1], [1, 1.9, 1.6]) : interpolate(punch, [0, 1], [1, 0.85])
          const tint = isPunch ? interpolateColors(punch, [0, 1], [ink, accent]) : interpolateColors(punch, [0, 1], [ink, muted])
          return h('span', { key: i, style: { display: 'inline-block', fontSize: 88, fontWeight: 700, lineHeight: 1, color: tint, margin: isPunch ? `0 ${punch * 44}px` : 0, opacity: Math.min(1, s * 2), transform: `translateY(${(1 - s) * 120}px) rotate(${(1 - s) * -12}deg) scale(${s * scale})` } }, word)
        })))
  }

  return { component: Kinetic, fps, width: 1280, height: 720 }
})
