import { remotionScene } from '@lincyaw/addon-motion/scene'

// spring({ reverse: true, durationInFrames }) runs a spring backwards from 1 to 0: an exit that mirrors the
// entrance. Multiply the entrance by the exit; before its start the reverse spring is 1, so nothing jumps.
const CANDIDATES = [{ t: '猫', p: 0.42 }, { t: '狗', p: 0.31 }, { t: '鸟', p: 0.12 }, { t: '鱼', p: 0.09 }, { t: '树', p: 0.06 }]
const BEAM = 2

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), surface = color('surface'), line = color('line-strong'), bg = color('bg')

  function Beam() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const gather = spring({ frame: frame - F(at(1)) - 12, fps: rate, config: { damping: 200 } })
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('div', { style: { position: 'absolute', top: 70, width: '100%', textAlign: 'center', fontSize: 40 } }, '我家养了一只 ___', h('span', { style: { color: muted, fontSize: 30 } }, `   （束宽 ${BEAM}）`)),
      CANDIDATES.map((c, i) => {
        const enter = spring({ frame: frame - F(at(0)), fps: rate, delay: i * 4, config: { damping: 14 } })
        const keep = i < BEAM
        const exit = keep ? 1 : spring({ frame: frame - F(at(1)), fps: rate, delay: (i - BEAM) * 3, reverse: true, durationInFrames: 14, config: { damping: 200 } })
        const v = enter * exit
        const y = interpolate(gather, [0, 1], [180 + i * 92, 260 + i * 130], C)
        return h('div', { key: i, style: { position: 'absolute', left: 340, top: keep ? y : 180 + i * 92, width: 600, height: 76, borderRadius: 16, background: surface, border: `3px solid ${keep ? accent : line}`, display: 'flex', alignItems: 'center', gap: 24, padding: '0 28px', boxSizing: 'border-box', opacity: v, transform: `translateX(${(1 - v) * (keep ? -200 : 300)}px) scale(${0.7 + 0.3 * v})` } },
          h('span', { style: { fontSize: 44, fontWeight: 700, width: 60 } }, c.t),
          h('span', { style: { flex: 1, height: 18, borderRadius: 9, background: line, position: 'relative', overflow: 'hidden' } },
            h('span', { style: { position: 'absolute', inset: 0, width: `${c.p / 0.42 * 100}%`, background: keep ? accent : muted } })),
          h('span', { style: { fontSize: 32, fontFamily: 'var(--pm-font-mono)', width: 80, textAlign: 'right' } }, c.p.toFixed(2)))
      }))
  }

  return { component: Beam, fps, width: 1280, height: 720 }
})
