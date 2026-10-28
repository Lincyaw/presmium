import { remotionScene } from '@lincyaw/addon-motion/scene'
import { isDark } from '../../kit/fx/theme.ts'
import { CLAMP } from '../../kit/remotion-fx.ts'

// Device hero, with Remotion: a product shot of an app drawn with a few blocks. State `rise` (1 s).
// 0–0.73 s (f0–22): the device rises from below tilted back 35° in perspective and straightens as it arrives, on
// a spring (damping 20, mass 1.2: no visible overshoot, a heavy object); its shadow is long and soft while it
// is low and tilted and tightens under it as it lands. 0.13–0.6 s: the screen wakes, from dim to lit. 0.47–0.93 s
// (f14–28): a glare, one wide soft band and a narrow sharp one, sweeps across the glass: one highlight makes it a
// material. 0.93–1 s: rest, flat and sharp: once the spring has settled the transform snaps to an exact
// identity, still written as a 3D transform, because Chromium rasterizes a layer that was once 3D a little
// differently from one that never was, and the rest frame must be the same however it was reached. The glare is
// the sheen token, which stays light in both themes; on the light page it shows on the dark bezel and the
// coloured blocks, not on the white screen, as on real glass. Shadows are the shadow token, stronger on the
// dark page. No text, no images (`Img` is not available): title bar, sidebar, a hero block and two cards.
const W = 800, H = 480, BEZEL = 14
const GLARE = [14, 28]

export default remotionScene(({ React, remotion, color }) => {
  const { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const dark = isDark(color('bg'))
  const mix = (name: string, pct: number) => `color-mix(in srgb, var(--pm-color-${name}) ${pct.toFixed(1)}%, transparent)`
  const bar = (width: string, tone = 'var(--pm-color-line)', height = 10) => h('div', { style: { width, height, borderRadius: height / 2, background: tone } })
  const card = (key: string) => h('div', { key, style: { flex: 1, borderRadius: 12, background: 'var(--pm-color-sunk)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { style: { width: 34, height: 34, borderRadius: 10, background: 'var(--pm-color-accent-soft)', marginBottom: 6 } }), bar('80%'), bar('55%'))
  // The screen, built once: it does not change with the frame.
  const screen = h('div', { style: { position: 'absolute', inset: BEZEL, borderRadius: 12, overflow: 'hidden', background: 'var(--pm-color-surface)', display: 'flex', flexDirection: 'column' } },
    h('div', { style: { height: 38, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', background: 'var(--pm-color-sunk)', borderBottom: '1px solid var(--pm-color-line)' } },
      ['danger', 'warn', 'ok'].map(c => h('div', { key: c, style: { width: 12, height: 12, borderRadius: 6, background: mix(c, 70) } })),
      h('div', { style: { margin: '0 auto', width: 240, height: 16, borderRadius: 8, background: 'var(--pm-color-surface)', border: '1px solid var(--pm-color-line)' } })),
    h('div', { style: { flex: 1, display: 'flex', gap: 18, padding: 18 } },
      h('div', { style: { width: 150, borderRadius: 12, background: 'var(--pm-color-sunk)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 } },
        bar('100%', 'var(--pm-color-accent)', 12), bar('70%'), bar('85%'), bar('60%'), bar('75%')),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 18 } },
        h('div', { style: { height: 150, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, background: 'linear-gradient(135deg, var(--pm-color-accent), color-mix(in srgb, var(--pm-color-accent) 72%, var(--pm-color-shadow)))' } },
          bar('46%', mix('on-accent', 85), 16), bar('30%', mix('on-accent', 55), 10)),
        h('div', { style: { flex: 1, display: 'flex', gap: 18 } }, card('a'), card('b')))))
  const shadowStrength = dark ? 2.2 : 1

  function Hero() {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    const s = spring({ frame, fps, config: { damping: 20, mass: 1.2 } })
    const settled = Math.abs(1 - s) < 0.002
    const low = 1 - s
    const opacity = interpolate(frame, [0, 6], [0, 1], CLAMP)
    const wake = interpolate(frame, [4, 18], [0, 1], { ...CLAMP, easing: Easing.out(Easing.quad) })
    const g = interpolate(frame, GLARE, [0, 1], CLAMP)
    const gx = -420 + (W + 640) * Easing.inOut(Easing.cubic)(g)
    const shadow = `0 ${24 + 90 * low}px ${40 + 120 * low}px ${mix('shadow', (18 + 10 * s) * shadowStrength)}, 0 ${4 + 10 * low}px ${10 + 20 * low}px ${mix('shadow', 10 * s * shadowStrength)}`
    return h(AbsoluteFill, { style: { overflow: 'hidden', perspective: 1600, perspectiveOrigin: '50% 40%' } },
      h('div', { style: { position: 'absolute', left: 640 - W / 2, top: 352 - H / 2, width: W, height: H, borderRadius: 26, overflow: 'hidden', opacity,
        background: 'color-mix(in srgb, var(--pm-color-shadow) 86%, var(--pm-color-ink))', boxShadow: `${shadow}, inset 0 0 0 1.5px ${mix('sheen', dark ? 18 : 22)}`,
        transformOrigin: '50% 100%', transform: settled ? 'translateY(0px) rotateX(0deg)' : `translateY(${(low * 220).toFixed(2)}px) rotateX(${(low * 35).toFixed(3)}deg)` } },
        screen,
        wake < 1 && h('div', { style: { position: 'absolute', inset: BEZEL, borderRadius: 12, background: 'var(--pm-color-shadow)', opacity: 0.6 * (1 - wake) } }),
        g > 0 && g < 1 && h('div', { style: { position: 'absolute', top: -120, bottom: -120, left: 0, width: 0, transform: `translateX(${gx.toFixed(1)}px) skewX(-18deg)` } },
          h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 260, background: `linear-gradient(90deg, transparent, ${mix('sheen', dark ? 16 : 34)}, transparent)` } }),
          h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: 300, width: 46, background: `linear-gradient(90deg, transparent, ${mix('sheen', dark ? 14 : 28)}, transparent)` } }))))
  }
  return { component: Hero, fps: 30, width: 1280, height: 720 }
})
