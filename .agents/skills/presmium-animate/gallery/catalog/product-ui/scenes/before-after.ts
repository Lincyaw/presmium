import { gsapScene } from '@lincyaw/addon-motion/scene'
import { esc, frame, num, screen, SCREEN_CSS, shadow, str, type Variant } from './lib/ui.ts'

// Before and after: two screenshots of the same place, compared by a divider that wipes the after over the
// before and then rests where both show. States `before`, `wipe`, `hold`. `before` (1.2 s): the before picture
// rises with its label; it is read alone first. `wipe` (1.4 s): 0–0.9 s the divider enters at the right edge
// and sweeps to the left edge, uncovering the after picture behind it (a mask, never a cross-fade), its label
// appears as it is uncovered; 0.9–1.1 s a dwell on the whole after; 1.1–1.4 s+ the divider returns to its
// resting place, so the two sides are compared: left is before, right is after, the one spatial convention.
// `hold` (2 s): the divider breathes 1% around its rest. The pictures are the author's (`before`, `after`), or
// two drawn pages. Adapted from HyperFrames before-after-wipe (with comparison-split).

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const before = parameters.before as string | undefined
  const after = parameters.after as string | undefined
  const [vb, va] = [str(parameters, 'beforeVariant', 'list') as Variant, str(parameters, 'afterVariant', 'dashboard') as Variant]
  const rest = Math.max(15, Math.min(85, num(parameters, 'rest', 50)))
  const lb = str(parameters, 'beforeLabel', '之前：一张清单')
  const la = str(parameters, 'afterLabel', '之后：一目了然')
  const f = frame(root, `
    ${SCREEN_CSS}
    .ba { position: absolute; left: 11cqw; top: 6cqh; width: 78cqw; height: 80cqh; border-radius: 1.4cqw; overflow: hidden; border: 0.15cqw solid var(--pm-color-line-strong); box-shadow: ${shadow(1.6)}; }
    .ba__side { position: absolute; inset: 0; }
    .ba__after { clip-path: inset(0 0 0 100%); }
    .ba__div { position: absolute; top: 0; bottom: 0; left: 100%; width: 0; }
    .ba__div::before { content: ''; position: absolute; top: 0; bottom: 0; left: -0.15cqw; width: 0.3cqw; background: var(--pm-color-accent); }
    .ba__knob { position: absolute; top: 50%; left: 0; width: 3.6cqw; height: 3.6cqw; margin: -1.8cqw 0 0 -1.8cqw; border-radius: 50%; background: var(--pm-color-accent); color: var(--pm-color-on-accent); display: grid; place-items: center; box-shadow: ${shadow(0.8)}; }
    .ba__knob svg { width: 60%; height: 60%; }
    .ba__tag { position: absolute; bottom: 2.4cqh; }
    .ba__tag--b { left: 1.4cqw; background: var(--pm-color-surface); color: var(--pm-color-muted); border: 0.15cqw solid var(--pm-color-line-strong); }
    .ba__tag--a { right: 1.4cqw; }
  `, `
    <div class="ba">
      <div class="ba__side ui-screen">${screen(before, vb)}</div>
      <div class="ba__side ba__after ui-screen">${screen(after, va)}</div>
      <span class="lf-chip ba__tag ba__tag--b">${esc(lb)}</span><span class="lf-chip ba__tag ba__tag--a">${esc(la)}</span>
      <div class="ba__div"><span class="ba__knob"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6 L3 12 L9 18 M15 6 L21 12 L15 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg></span></div>
    </div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  // One clock for the divider and the mask: both are tweened with the same time and ease, so they read as one.
  const move = (to: number, duration: number, ease: string, t: number) => {
    tl.to('.ba__div', { left: `${to}%`, duration, ease }, t)
    tl.to('.ba__after', { clipPath: `inset(0% 0% 0% ${to}%)`, duration, ease }, t)
  }
  gsap.set('.ba__div', { left: '100%' })
  gsap.set('.ba__after', { clipPath: 'inset(0% 0% 0% 100%)' })
  // before
  gsap.set('.ba', { autoAlpha: 0, yPercent: 4 })
  tl.to('.ba', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  gsap.set(['.ba__tag--b', '.ba__tag--a', '.ba__div'], { autoAlpha: 0 })
  tl.to('.ba__tag--b', { autoAlpha: 1, duration: 0.3 }, 0.35)
  // wipe: the divider sweeps to the left edge, dwells, returns to rest
  const t = s(1)
  tl.to('.ba__div', { autoAlpha: 1, duration: 0.12 }, t)
  move(0, 0.9, 'power3.inOut', t)
  tl.to('.ba__tag--a', { autoAlpha: 1, duration: 0.25 }, t + 0.3)
  tl.to('.ba__tag--b', { autoAlpha: 0, duration: 0.2 }, t + 0.6)
  move(rest, 0.55, 'power3.inOut', t + 1.1)
  tl.to('.ba__tag--b', { autoAlpha: 1, duration: 0.25 }, t + 1.35)
  // hold: a small breath around the rest
  const h = s(2), len = (durations[2] ?? 2000) / 1000
  move(rest + 1, len / 2, 'sine.inOut', h)
  move(rest, len / 2, 'sine.inOut', h + len / 2)
  return tl
})
