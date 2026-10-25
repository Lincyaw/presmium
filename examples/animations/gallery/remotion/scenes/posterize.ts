import { remotionScene } from '@lincyaw/addon-motion/scene'

// interpolate's posterize option holds the input for N frames: the same bounce at 30 fps (left) and in
// steps of 5 frames (right, a stop-motion look). Then a clock hand ticks once a second (posterize: fps), 30 degrees a tick.
export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), warn = color('warn'), line = color('line-strong'), surface = color('surface'), bg = color('bg')
  const drop = [F(at(0)), F(at(0) + durations[0]! * 0.95)] as const

  function Posterize() {
    const frame = useCurrentFrame()
    const smooth = interpolate(frame, drop, [0, 1], { ...C, easing: Easing.bounce })
    const stepped = interpolate(frame, drop, [0, 1], { ...C, easing: Easing.bounce, posterize: 5 })
    // posterize rounds the input frame down to a multiple of N counted from frame 0, so pass the frame relative
    // to the step: then the first tick lands one second after the step starts.
    const clock = interpolate(frame - F(at(1)), [0, 12 * fps], [0, 360], { ...C, posterize: fps })
    const showClock = interpolate(frame, [F(at(1)), F(at(1)) + 8], [0, 1], C)
    const Ball = (x: number, y: number, fill: string, label: string) => h(React.Fragment, null,
      h('div', { style: { position: 'absolute', left: x - 40, top: 110 + y * 420, width: 80, height: 80, borderRadius: '50%', background: fill } }),
      h('div', { style: { position: 'absolute', left: x - 150, width: 300, top: 640, textAlign: 'center', fontSize: 28, fontFamily: 'var(--pm-font-mono)', color: muted } }, label))
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('div', { style: { position: 'absolute', left: 120, right: 120, top: 612, height: 4, background: line } }),
      Ball(300, smooth, accent, '每帧'),
      Ball(620, stepped, warn, 'posterize: 5'),
      h('div', { style: { position: 'absolute', left: 860, top: 200, width: 300, height: 300, borderRadius: '50%', background: surface, border: `4px solid ${line}`, opacity: showClock } },
        h('div', { style: { position: 'absolute', left: 147, top: 30, width: 6, height: 120, background: ink, transformOrigin: '3px 120px', transform: `rotate(${clock}deg)`, borderRadius: 3 } }),
        h('div', { style: { position: 'absolute', left: 138, top: 138, width: 24, height: 24, borderRadius: '50%', background: ink } }),
        h('div', { style: { position: 'absolute', top: 320, width: 300, textAlign: 'center', fontSize: 28, fontFamily: 'var(--pm-font-mono)', color: muted } }, `posterize: ${fps}`)))
  }

  return { component: Posterize, fps, width: 1280, height: 720 }
})
