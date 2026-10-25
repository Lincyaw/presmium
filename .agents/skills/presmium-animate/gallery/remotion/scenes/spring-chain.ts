import { remotionScene } from '@lincyaw/addon-motion/scene'

// measureSpring: how many frames a spring takes to settle. Chaining stage k to start when stage k-1 settles
// gives a cascade with no guessed delays; the total is printed so :durations: can be checked against it.
const STAGES = ['取指', '译码', '执行', '访存', '写回']
const CONFIG = { damping: 20, stiffness: 200 }

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, interpolate, spring, measureSpring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), onAccent = color('on-accent'), surface = color('surface'), line = color('line-strong'), bg = color('bg')
  const settle = measureSpring({ fps, config: CONFIG }) // 15 frames at 30 fps

  function Chain() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const note = interpolate(frame, [F(at(1)), F(at(1)) + 10], [0, 1], C)
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      STAGES.map((stage, k) => {
        const start = F(at(0)) + k * settle
        const s = spring({ frame: frame - start, fps: rate, config: CONFIG })
        const done = frame >= start + settle
        return h('div', { key: k, style: { position: 'absolute', left: 90 + k * 225, top: 240, width: 200, height: 160, borderRadius: 20, background: done ? accent : surface, color: done ? onAccent : ink, border: `3px solid ${done ? accent : line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 700, transform: `translateY(${(1 - s) * -200}px)`, opacity: Math.min(1, s * 3) } }, stage)
      }),
      h('div', { style: { position: 'absolute', top: 470, width: '100%', textAlign: 'center', fontSize: 34, fontFamily: 'var(--pm-font-mono)', color: muted, opacity: note } },
        `measureSpring(${JSON.stringify(CONFIG).replace(/"/g, '')}) = ${settle} 帧`),
      h('div', { style: { position: 'absolute', top: 530, width: '100%', textAlign: 'center', fontSize: 34, opacity: note } },
        `${STAGES.length} 级 × ${settle} 帧 = ${STAGES.length * settle} 帧 = ${(STAGES.length * settle / fps).toFixed(1)} 秒`))
  }

  return { component: Chain, fps, width: 1280, height: 720 }
})
