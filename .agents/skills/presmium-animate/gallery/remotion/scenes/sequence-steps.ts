import { remotionScene } from '@lincyaw/addon-motion/scene'

// Steps as Sequences: each step is a <Sequence from={frame of at(k)}>, so useCurrentFrame() inside it counts
// from 0 at the step's start. No durationInFrames: a step stays on screen after its own window.
const STAGES = ['分词', '嵌入', '注意力']

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), surface = color('surface'), line = color('line-strong'), bg = color('bg')

  function Card({ k }: { k: number }) {
    const frame = useCurrentFrame() // local: 0 at at(k)
    const { fps: rate } = useVideoConfig()
    const s = spring({ frame, fps: rate, config: { damping: 14 } })
    const arrow = interpolate(frame, [0, 12], [0, 1], C)
    const left = 110 + k * 380
    return h(React.Fragment, null,
      k > 0 && h('div', { style: { position: 'absolute', left: left - 90, top: 355, width: 70 * arrow, height: 6, background: line } }),
      h('div', { style: { position: 'absolute', left, top: 250, width: 300, height: 220, borderRadius: 24, background: surface, border: `3px solid ${k === 2 ? accent : line}`, transform: `translateY(${(1 - s) * 80}px) scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s * 1.5), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 } },
        h('div', { style: { fontSize: 52, fontWeight: 700, color: ink } }, STAGES[k]),
        h('div', { style: { fontSize: 26, fontFamily: 'var(--pm-font-mono)', color: muted } }, `局部帧 ${frame}`)))
  }

  function Steps() {
    return h(AbsoluteFill, { style: { background: bg, color: ink, fontFamily: 'var(--pm-font-sans)', fontSize: 32, lineHeight: 1.2 } },
      h('div', { style: { position: 'absolute', top: 90, width: '100%', textAlign: 'center', fontSize: 36, color: muted, fontFamily: 'var(--pm-font-mono)' } }, '<Sequence from={F(at(k))}>'),
      STAGES.map((_, k) => h(Sequence, { key: k, from: F(at(k)), layout: 'none' }, h(Card, { k }))))
  }

  return { component: Steps, fps, width: 1280, height: 720 }
})
