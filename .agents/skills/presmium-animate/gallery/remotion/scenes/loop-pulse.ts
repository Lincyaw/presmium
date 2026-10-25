import { remotionScene } from '@lincyaw/addon-motion/scene'

// Loop: children see a frame that restarts every durationInFrames, so a packet runs the link again and
// again and a ring pulses around the server. Put the Loop in a Sequence to start it at a step.
export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, Sequence, Loop, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), accent = color('accent'), warn = color('warn'), surface = color('surface'), line = color('line-strong'), bg = color('bg')
  const A = { x: 260, y: 360 }, B = { x: 1020, y: 360 }

  function Packet({ back }: { back: boolean }) {
    const f = useCurrentFrame() // restarts every loop
    const p = interpolate(f, [0, 24], [0, 1], { ...C, easing: Easing.inOut(Easing.quad) })
    const x = back ? B.x - (B.x - A.x) * p : A.x + (B.x - A.x) * p
    return h('div', { style: { position: 'absolute', left: x - 18, top: (back ? 400 : 302), width: 36, height: 36, borderRadius: 8, background: back ? warn : accent, opacity: interpolate(f, [0, 3, 21, 24], [0, 1, 1, 0], C) } })
  }

  function Pulse() {
    const f = useCurrentFrame()
    const p = interpolate(f, [0, 30], [0, 1], { ...C, easing: Easing.out(Easing.cubic) })
    return h('div', { style: { position: 'absolute', left: B.x - 110, top: B.y - 110, width: 220, height: 220, borderRadius: '50%', border: `6px solid ${accent}`, transform: `scale(${0.6 + p * 0.9})`, opacity: 1 - p } })
  }

  const Node = (at: { x: number, y: number }, label: string) =>
    h('div', { style: { position: 'absolute', left: at.x - 110, top: at.y - 80, width: 220, height: 160, borderRadius: 24, background: surface, border: `3px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700 } }, label)

  function Network() {
    const frame = useCurrentFrame()
    const appear = interpolate(frame, [F(at(0)), F(at(0)) + 12], [0, 1], C)
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h(AbsoluteFill, { style: { opacity: appear } },
        h('div', { style: { position: 'absolute', left: A.x + 110, top: A.y - 2, width: B.x - A.x - 220, height: 4, background: line } }),
        h(Sequence, { from: F(at(1)), layout: 'none' }, h(Loop, { durationInFrames: 30, layout: 'none' }, h(Pulse))),
        Node(A, '客户端'), Node(B, '服务器'),
        h(Sequence, { from: F(at(1)), layout: 'none' },
          h(Loop, { durationInFrames: 24, layout: 'none' }, h(Packet, { back: false })),
          h(Sequence, { from: 12, layout: 'none' }, h(Loop, { durationInFrames: 24, layout: 'none' }, h(Packet, { back: true }))))))
  }

  return { component: Network, fps, width: 1280, height: 720 }
})
