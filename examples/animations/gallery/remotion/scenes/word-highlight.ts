import { remotionScene } from '@lincyaw/addon-motion/scene'

// Word-by-word highlight: each word has its own interpolate window; a marker behind it grows with scaleX.
// Then interpolateColors turns the key phrase to the accent and dims the rest. Colors come from color().
const WORDS = ['梯度下降', '沿着', '损失', '下降', '最快', '的', '方向，', '一小步', '一小步', '地', '更新', '参数。']
const KEY = new Set([3, 4, 5, 6])

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), pen = color('warn'), bg = color('bg')
  const per = F(durations[0]! * 0.9) / WORDS.length

  function Highlight() {
    const frame = useCurrentFrame()
    const focus = interpolate(frame, [F(at(1)), F(at(1)) + 12], [0, 1], C)
    return h(AbsoluteFill, { style: { background: bg, alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { width: 1040, fontSize: 64, lineHeight: 1.7, fontFamily: 'var(--pm-font-sans)', color: ink } },
        WORDS.map((word, i) => {
          const start = F(at(0)) + i * per
          const mark = interpolate(frame, [start, start + per], [0, 1], C)
          const key = KEY.has(i)
          const text = interpolateColors(focus, [0, 1], [ink, key ? accent : muted])
          return h('span', { key: i, style: { position: 'relative', display: 'inline-block', marginRight: 6 } },
            h('span', { style: { position: 'absolute', left: -4, right: -4, bottom: 8, height: '0.45em', background: pen, opacity: 0.35, transform: `scaleX(${mark * (key ? 1 : 1 - focus)})`, transformOrigin: 'left' } }),
            h('span', { style: { position: 'relative', color: text, fontWeight: key && focus > 0.5 ? 700 : 400 } }, word))
        })))
  }

  return { component: Highlight, fps, width: 1280, height: 720 }
})
