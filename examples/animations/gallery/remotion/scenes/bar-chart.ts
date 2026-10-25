import { remotionScene } from '@lincyaw/addon-motion/scene'

// A bar chart: bars rise with staggered springs (spring's delay), then morph to new data with a second
// spring that blends old and new heights. damping 200 gives a smooth, bounce-free settle.
const TOKENS = ['the', 'cat', 'sat', 'on', 'mat']
const LOGITS = [2.0, 1.0, 0.5, 0.2, 1.5]
const softmax = (t: number) => { const e = LOGITS.map(x => Math.exp(x / t)); const s = e.reduce((a, b) => a + b); return e.map(x => x / s) }
const T1 = softmax(1), T2 = softmax(0.4)

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), line = color('line-strong'), bg = color('bg')
  const H = 420, BASE = 560

  function Bars() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const change = spring({ frame: frame - F(at(1)), fps: rate, config: { damping: 200 } })
    return h(AbsoluteFill, { style: { background: bg, color: ink, fontFamily: 'var(--pm-font-sans)', fontSize: 30, lineHeight: 1.2 } },
      h('div', { style: { position: 'absolute', top: 50, width: '100%', textAlign: 'center', fontSize: 40 } },
        'softmax 温度 T = ', h('span', { style: { color: accent, fontVariantNumeric: 'tabular-nums' } }, interpolate(change, [0, 1], [1, 0.4]).toFixed(1))),
      h('div', { style: { position: 'absolute', left: 200, top: BASE, width: 880, height: 3, background: line } }),
      TOKENS.map((token, i) => {
        const grow = spring({ frame: frame - F(at(0)), fps: rate, delay: i * 4, config: { damping: 200 } })
        const p = interpolate(change, [0, 1], [T1[i]!, T2[i]!])
        const height = grow * p * H / 0.85
        const left = 240 + i * 170
        return h(React.Fragment, { key: i },
          h('div', { style: { position: 'absolute', left, top: BASE - height, width: 110, height, borderRadius: '12px 12px 0 0', background: i === 0 ? accent : muted } }),
          h('div', { style: { position: 'absolute', left, width: 110, top: BASE - height - 44, textAlign: 'center', fontSize: 28, fontVariantNumeric: 'tabular-nums', opacity: grow } }, p.toFixed(2)),
          h('div', { style: { position: 'absolute', left, width: 110, top: BASE + 14, textAlign: 'center', fontFamily: 'var(--pm-font-mono)' } }, token))
      }))
  }

  return { component: Bars, fps, width: 1280, height: 720 }
})
