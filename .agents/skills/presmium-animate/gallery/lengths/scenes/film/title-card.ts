import { remotionScene } from '@lincyaw/addon-motion/scene'

// A paper's title card with Remotion, for the end of a paper film. `title`: the words spring in one by one and
// a rule grows under them. `meta`: authors, venue and the address rise in, smaller and muted. `hold`: nothing
// moves, long enough to read the address (at least 2 s). Conference title cards run 3 to 5 seconds.
export default remotionScene(({ React, remotion, at, color, parameters }) => {
  const { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const title = (parameters.title as string | undefined) ?? 'Attention Is All You Need'
  const authors = (parameters.authors as string | undefined) ?? 'Vaswani et al.'
  const venue = (parameters.venue as string | undefined) ?? 'NeurIPS 2017'
  const address = (parameters.address as string | undefined) ?? 'arxiv.org/abs/1706.03762'
  const fps = 30
  const F = (ms: number) => Math.round((ms * fps) / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), soft = color('accent-soft')
  function Card() {
    const frame = useCurrentFrame()
    const { fps: rate } = useVideoConfig()
    const words = title.split(' ')
    const rule = interpolate(frame, [F(at(0)) + 8, F(at(0)) + 8 + words.length * 3 + 12], [0, 1], { ...C, easing: (t: number) => 1 - (1 - t) ** 3 })
    const meta = spring({ frame: frame - F(at(1)), fps: rate, config: { damping: 200 } })
    return h(AbsoluteFill, { style: { alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 34, fontFamily: 'var(--pm-font-sans)', lineHeight: 1.2 } },
      h('div', { style: { display: 'flex', gap: 22, fontFamily: 'var(--pm-font-serif)', fontSize: 80, fontWeight: 600, color: ink, whiteSpace: 'nowrap' } },
        words.map((word, i) => {
          const s = spring({ frame: frame - F(at(0)) - i * 3, fps: rate, config: { damping: 14, stiffness: 150 } })
          return h('span', { key: i, style: { display: 'inline-block', opacity: interpolate(s, [0, 0.4], [0, 1], C), transform: `translateY(${(1 - s) * 40}px)` } }, word)
        })),
      h('div', { style: { width: 520 * rule, height: 6, borderRadius: 3, background: accent } }),
      h('div', { style: { display: 'flex', gap: 24, alignItems: 'center', fontSize: 34, color: muted, whiteSpace: 'nowrap', opacity: meta, transform: `translateY(${(1 - meta) * 24}px)` } },
        h('span', null, authors),
        h('span', { style: { padding: '6px 20px', borderRadius: 999, background: soft, color: accent, fontWeight: 600 } }, venue)),
      h('div', { style: { fontFamily: 'var(--pm-font-mono)', fontSize: 30, color: ink, opacity: interpolate(frame, [F(at(1)) + 9, F(at(1)) + 18], [0, 1], C) } }, address))
  }
  return { component: Card, fps, width: 1280, height: 720 }
})
