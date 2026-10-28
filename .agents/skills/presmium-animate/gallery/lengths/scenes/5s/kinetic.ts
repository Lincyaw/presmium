import { remotionScene } from '@lincyaw/addon-motion/scene'

// Kinetic type with Remotion, in three states. `head`: the line springs in character by character (2 frames
// apart, rising and turning upright). `items`: the items land one per beat under it; the beat is the state's
// length divided by their number, so the rhythm stays even whatever the duration. `punch`: the line takes the
// accent color and grows once while the items step back to the muted color; the rest of the state is a hold.
// Every word stays on screen at least 0.6 s after it lands: short enough to feel quick, long enough to read.
export default remotionScene(({ React, remotion, at, durations, color, parameters }) => {
  const { AbsoluteFill, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const head = (parameters.head as string | undefined) ?? '一份文稿'
  const items = (parameters.items as string[] | undefined) ?? ['网页', '幻灯片', 'Notebook', '视频']
  const fps = 30
  const F = (ms: number) => Math.round((ms * fps) / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent')
  const beat = F(durations[1] ?? 1200) / Math.max(1, items.length)

  function Kinetic() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const punch = durations.length > 2 ? spring({ frame: frame - F(at(2)), fps: rate, config: { damping: 12, stiffness: 150 } }) : 0
    return h(AbsoluteFill, { style: { alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 56, fontFamily: 'var(--pm-font-sans)', lineHeight: 1.2 } },
      h('div', { style: { display: 'flex', fontFamily: 'var(--pm-font-serif)', fontSize: 104, fontWeight: 600, whiteSpace: 'nowrap', color: interpolateColors(punch, [0, 1], [ink, accent]), transform: `scale(${interpolate(punch, [0, 0.6, 1], [1, 1.16, 1.1])})` } },
        [...head].map((ch, i) => {
          const s = spring({ frame: frame - F(at(0)) - i * 2, fps: rate, config: { damping: 13, stiffness: 160 } })
          return h('span', { key: i, style: { display: 'inline-block', opacity: interpolate(s, [0, 0.4], [0, 1], C), transform: `translateY(${(1 - s) * 70}px) rotate(${(1 - s) * -10}deg)` } }, ch)
        })),
      h('div', { style: { display: 'flex', gap: 36, fontSize: 52, fontWeight: 600, whiteSpace: 'nowrap' } },
        items.map((item, i) => {
          const s = spring({ frame: frame - F(at(1)) - Math.round(i * beat), fps: rate, config: { damping: 14, stiffness: 180 } })
          return h('span', { key: i, style: { display: 'inline-block', opacity: interpolate(s, [0, 0.3], [0, 1], C), transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`, color: interpolateColors(punch, [0, 1], [ink, muted]) } }, item)
        })))
  }
  return { component: Kinetic, fps, width: 1280, height: 720 }
})
