import { remotionScene } from '@lincyaw/addon-motion/scene'

// spring(): a title pops in, then four balls race to the same line with different spring configs
// (default, damping 200, overshootClamping, heavy mass). Feed spring the frame relative to the step's start.
const RACERS = [
  { label: '默认 { damping: 10 }', config: {} },
  { label: '{ damping: 200 } 不回弹', config: { damping: 200 } },
  { label: '{ overshootClamping: true }', config: { overshootClamping: true } },
  { label: '{ mass: 3 } 更沉', config: { mass: 3 } },
]

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), line = color('line-strong'), bg = color('bg')

  function SpringPop() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const pop = spring({ frame: frame - F(at(0)), fps: rate, config: { damping: 11, stiffness: 120 } })
    const START = 440, END = 1080
    return h(AbsoluteFill, { style: { background: bg, color: ink, fontFamily: 'var(--pm-font-sans)', fontSize: 32, lineHeight: 1.2 } },
      h('div', { style: { position: 'absolute', top: 70, width: '100%', textAlign: 'center', fontSize: 96, fontWeight: 700, fontFamily: 'var(--pm-font-mono)', color: accent, transform: `scale(${pop})` } }, 'spring()'),
      h('div', { style: { position: 'absolute', left: END, top: 250, width: 4, height: 400, background: line } }),
      RACERS.map((racer, i) => {
        const x = spring({ frame: frame - F(at(1)), fps: rate, config: racer.config })
        const y = 290 + i * 95
        return h(React.Fragment, { key: i },
          h('div', { style: { position: 'absolute', left: 40, top: y - 20, width: 360, fontSize: 22, whiteSpace: 'nowrap', fontFamily: 'var(--pm-font-mono)', color: muted } }, racer.label),
          h('div', { style: { position: 'absolute', left: START + (END - START) * x - 28, top: y - 28, width: 56, height: 56, borderRadius: '50%', background: i === 0 ? accent : ink, opacity: pop } }))
      }))
  }

  return { component: SpringPop, fps, width: 1280, height: 720 }
})
