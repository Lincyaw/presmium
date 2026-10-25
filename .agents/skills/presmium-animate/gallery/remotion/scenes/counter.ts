import { remotionScene } from '@lincyaw/addon-motion/scene'

// A number counter: interpolate between the step's start and end values with Easing.out(Easing.cubic),
// round, and format; tabular-nums keeps the width steady. A log-scale bar follows the same value.
const MODELS = [{ name: 'GPT-1 (2018)', n: 117e6 }, { name: 'GPT-2 (2019)', n: 1.5e9 }, { name: 'GPT-3 (2020)', n: 175e9 }]

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), sunk = color('sunk'), bg = color('bg')
  // Keyframes: the value at the end of each step's count (90% of the step).
  const frames = MODELS.flatMap((_, k) => [F(at(k)), F(at(k) + durations[k]! * 0.9)])
  const values = MODELS.flatMap((m, k) => [k === 0 ? 0 : MODELS[k - 1]!.n, m.n])

  function Counter() {
    const frame = useCurrentFrame()
    const v = interpolate(frame, frames, values, { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    const k = Math.max(0, MODELS.findLastIndex((_, i) => frame >= F(at(i))))
    const bar = Math.max(0, Math.log10(Math.max(v, 1e6)) - 6) / (Math.log10(MODELS[2]!.n) - 6)
    return h(AbsoluteFill, { style: { background: bg, color: ink, fontFamily: 'var(--pm-font-sans)', alignItems: 'center', justifyContent: 'center', gap: 36 } },
      h('div', { style: { fontSize: 40, color: muted } }, `参数量 · ${MODELS[k]!.name}`),
      h('div', { style: { fontSize: 120, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: accent, lineHeight: 1 } }, Math.round(v).toLocaleString('en-US')),
      h('div', { style: { width: 900, height: 28, borderRadius: 14, background: sunk, overflow: 'hidden' } },
        h('div', { style: { width: `${bar * 100}%`, height: '100%', background: accent } })),
      h('div', { style: { fontSize: 26, color: muted } }, '条长按对数刻度，从一百万到一千七百五十亿'))
  }

  return { component: Counter, fps, width: 1280, height: 720 }
})
