import { remotionScene } from '@lincyaw/addon-motion/scene'

// A lower-third caption: an accent bar grows (scaleX from a spring), the name slides up out of a mask
// (overflow hidden), a second line follows with spring's delay; it leaves with a reverse spring.
export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), surface = color('surface'), sunk = color('sunk'), bg = color('bg')

  function LowerThird() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const bar = spring({ frame: frame - F(at(0)), fps: rate, config: { damping: 200 }, durationInFrames: 12 })
    const name = spring({ frame: frame - F(at(0)), fps: rate, delay: 6, config: { damping: 18 } })
    const note = spring({ frame: frame - F(at(1)), fps: rate, config: { damping: 18 } })
    const out = spring({ frame: frame - F(at(2)), fps: rate, reverse: true, durationInFrames: 14, config: { damping: 200 } })
    return h(AbsoluteFill, { style: { background: sunk, fontFamily: 'var(--pm-font-sans)', color: ink } },
      // The "footage": a stand-in slide.
      h(AbsoluteFill, { style: { alignItems: 'center', justifyContent: 'center', fontSize: 72, color: muted, fontFamily: 'var(--pm-font-serif)', paddingBottom: 200 } }, 'B₁ = −1/2,  B₂ = 1/6,  B₄ = −1/30 …'),
      h('div', { style: { position: 'absolute', left: 80, bottom: 90, opacity: out, transform: `translateX(${(1 - out) * -120}px)` } },
        h('div', { style: { width: 12, height: 150, background: accent, position: 'absolute', left: 0, top: 0, transform: `scaleY(${bar})`, transformOrigin: 'top' } }),
        h('div', { style: { marginLeft: 12, padding: '18px 36px', background: surface, transform: `scaleX(${bar})`, transformOrigin: 'left', minWidth: 640, boxSizing: 'border-box' } },
          h('div', { style: { overflow: 'hidden', height: 64 } },
            h('div', { style: { fontSize: 52, fontWeight: 700, lineHeight: '64px', transform: `translateY(${(1 - name) * 64}px)` } }, 'Ada Lovelace')),
          h('div', { style: { overflow: 'hidden', height: 44 } },
            h('div', { style: { fontSize: 32, lineHeight: '44px', color: muted, transform: `translateY(${(1 - name) * 44}px)` } }, '第一位程序员')),
          h('div', { style: { overflow: 'hidden', height: 44 * Math.min(1, note) } },
            h('div', { style: { fontSize: 30, lineHeight: '44px', color: accent, transform: `translateY(${(1 - note) * 44}px)` } }, '注 G：分析机计算伯努利数的程序（1843）')))))
  }

  return { component: LowerThird, fps, width: 1280, height: 720 }
})
