import { remotionScene } from '@lincyaw/addon-motion/scene'

// Typewriter: the number of characters shown is interpolate(frame) (clamped), sliced by code points.
// The caret is solid while typing and blinks (a function of the frame, not a timer) when idle.
const LINES = ['def softmax(x):', '    e = np.exp(x - x.max())', '    return e / e.sum()']
const STEP_OF_LINE = [0, 1, 1]

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), accent = color('accent'), surface = color('surface'), keyword = color('syntax-keyword'), line = color('line-strong'), bg = color('bg')
  // Each line gets an even share of its step's time.
  const windows = LINES.map((_, i) => {
    const k = STEP_OF_LINE[i]!, mine = STEP_OF_LINE.filter(s => s === k).length, n = STEP_OF_LINE.slice(0, i).filter(s => s === k).length
    const start = at(k), span = durations[k]! * 0.85 / mine
    return [F(start + n * span), F(start + (n + 1) * span)] as const
  })

  function Typewriter() {
    const frame = useCurrentFrame()
    const counts = LINES.map((text, i) => Math.round(interpolate(frame, windows[i]!, [0, Array.from(text).length], C)))
    const typing = windows.some(([a, b]) => frame >= a && frame < b)
    const current = Math.max(0, counts.findLastIndex(n => n > 0))
    const caretOn = typing || Math.floor(frame / 15) % 2 === 0
    return h(AbsoluteFill, { style: { background: bg, alignItems: 'center', justifyContent: 'center' } },
      h('div', { style: { width: 1000, padding: '48px 56px', borderRadius: 24, background: surface, border: `2px solid ${line}`, fontFamily: 'var(--pm-font-mono)', fontSize: 44, lineHeight: 1.6, color: ink, whiteSpace: 'pre' } },
        LINES.map((text, i) => {
          const shown = Array.from(text).slice(0, counts[i]).join('')
          const kw = shown.match(/^(\s*)(def|return)?(.*)$/s)!
          return h('div', { key: i, style: { minHeight: '1.6em' } },
            kw[1], h('span', { style: { color: keyword } }, kw[2] ?? ''), kw[3],
            i === current && h('span', { style: { display: 'inline-block', width: '0.55em', height: '1.1em', marginLeft: 2, verticalAlign: '-0.15em', background: accent, opacity: caretOn ? 1 : 0 } }))
        })))
  }

  return { component: Typewriter, fps, width: 1280, height: 720 }
})
