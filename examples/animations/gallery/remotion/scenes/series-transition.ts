import { remotionScene } from '@lincyaw/addon-motion/scene'

// Series with a negative offset: panel k starts at at(k) but the one before it lasts T frames longer, so the
// two overlap and the slide/fade transition is written by hand. useVideoConfig().durationInFrames inside a
// Series.Sequence is that sequence's own length (the last one's is cut at the composition's end, so it must
// not run its exit), so a panel knows when to leave.
const PANELS = [
  { title: '1 前向传播', body: 'x → 网络 → ŷ' },
  { title: '2 计算损失', body: 'L = (ŷ − y)²' },
  { title: '3 反向传播', body: '∂L/∂w → 更新 w' },
]

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, Series, interpolate, Easing, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), surface = color('surface'), line = color('line-strong'), bg = color('bg')
  const T = 12 // overlap frames

  function Panel({ k }: { k: number }) {
    const frame = useCurrentFrame()
    const { durationInFrames } = useVideoConfig() // this sequence's length, not the composition's
    const enter = interpolate(frame, [0, T], [1, 0], C)
    // The last panel stays: its sequence runs to the end of the composition and must not leave there.
    const leave = k < PANELS.length - 1 ? interpolate(frame, [durationInFrames - T, durationInFrames], [0, 1], C) : 0
    return h(AbsoluteFill, { style: { alignItems: 'center', justifyContent: 'center', transform: `translateX(${(enter - leave) * 100}%)`, opacity: 1 - Math.max(enter, leave) * 0.8 } },
      h('div', { style: { width: 820, height: 420, borderRadius: 28, background: surface, border: `3px solid ${line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 } },
        h('div', { style: { fontSize: 60, fontWeight: 700, color: accent } }, PANELS[k]!.title),
        h('div', { style: { fontSize: 52, fontFamily: 'var(--pm-font-mono)', color: ink } }, PANELS[k]!.body)))
  }

  function Slides() {
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink, overflow: 'hidden' } },
      h(Series, null, PANELS.map((_, k) => h(Series.Sequence, {
        key: k,
        // Series places sequence k right after k-1; offset -T pulls it back so it starts at at(k).
        durationInFrames: k === PANELS.length - 1 ? Infinity : F(durations[k]!) + T,
        offset: k === 0 ? F(at(0)) : -T,
      }, h(Panel, { k })))),
      h('div', { style: { position: 'absolute', bottom: 40, width: '100%', textAlign: 'center', fontSize: 26, color: muted, fontFamily: 'var(--pm-font-mono)' } }, '<Series.Sequence offset={-T}>'))
  }

  return { component: Slides, fps, width: 1280, height: 720 }
})
