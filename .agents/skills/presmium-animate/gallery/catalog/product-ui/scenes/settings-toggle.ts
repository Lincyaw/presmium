import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, esc, frame, list, num, pick, POINTER, POINTER_CSS, shadow, str } from './lib/ui.ts'

// Settings toggle: a settings card, the pointer flips one switch, the setting confirms itself. States `rows`,
// `press`, `done`. `rows` (1 s): the card rises, its rows follow 40 ms apart (a UI list), the pointer arrives at
// the chosen switch as the state ends. `press` (1 s): 0–0.12 s the pointer dips and the thumb squashes toward
// where it will go (anticipation); 0.12–0.5 s the thumb slides across and overshoots by 4% before it settles,
// the track takes the accent colour as the thumb lands (colour last), a ring spreads from the tip. `done`
// (1.8 s): a confirmation chip rises under the card (the effect, after the cause has finished), the pointer steps
// aside; hold. Switches that are already on are drawn on from the start. Adapted from HyperFrames
// settings-toggle-flow (with toggle-flip).
interface Row { label: string, hint?: string, on?: boolean }

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const rows = list<Row>(parameters, 'rows', [
    { label: '自动保存', hint: '每次修改后立即保存', on: false },
    { label: '显示字幕', hint: '播放讲授视频时显示', on: true },
    { label: '讲解语音', hint: '为每一步生成配音', on: true },
    { label: '暗色主题', hint: '跟随系统设置', on: false },
  ]).slice(0, 5)
  const target = Math.max(0, Math.min(rows.length - 1, num(parameters, 'target', 0)))
  const title = str(parameters, 'title', '偏好设置')
  const result = str(parameters, 'result', '✓ 已开启自动保存')
  const ROW = 11, TOP = 10 + 9   // cqh: the card's top plus its header
  const f = frame(root, `
    ${POINTER_CSS}
    .st { position: absolute; left: 27cqw; width: 46cqw; top: 10cqh; padding-bottom: 1cqh; border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.6)}; overflow: hidden; }
    .st__head { height: 9cqh; display: flex; align-items: center; padding: 0 2.4cqw; font-size: 2.2cqw; font-weight: 600; border-bottom: 0.15cqw solid var(--pm-color-line); }
    .st__row { height: ${ROW}cqh; display: flex; align-items: center; gap: 2cqw; padding: 0 2.4cqw; border-bottom: 0.15cqw solid var(--pm-color-line); }
    .st__row:last-child { border-bottom: 0; }
    .st__txt { flex: 1; display: flex; flex-direction: column; gap: 0.4cqh; }
    .st__label { font-size: 1.9cqw; font-weight: 600; }
    .st__hint { font-size: 1.45cqw; color: var(--pm-color-muted); }
    .st__track { position: relative; width: 5.6cqw; height: 3.2cqw; flex: none; border-radius: 99cqw; background: var(--pm-color-line-strong); }
    .st__track.is-on { background: var(--pm-color-accent); }
    .st__thumb { position: absolute; left: 0.3cqw; top: 0.3cqw; width: 2.6cqw; height: 2.6cqw; border-radius: 50%; background: var(--pm-color-surface); box-shadow: ${shadow(0.4)}; transform-origin: 0 50%; }
    .st__track.is-on .st__thumb { left: 2.7cqw; }
    .st__ok { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; top: ${TOP + ROW * rows.length + 6}cqh; background: var(--pm-color-ok-soft); color: var(--pm-color-ok); }
  `, `
    <div class="st"><div class="st__head">${esc(title)}</div>${rows.map((r, i) => `<div class="st__row"><div class="st__txt"><span class="st__label">${esc(r.label)}</span>${r.hint ? `<span class="st__hint">${esc(r.hint)}</span>` : ''}</div><span class="st__track${r.on && i !== target ? ' is-on' : ''}" data-i="${i}"><i class="st__thumb"></i></span></div>`).join('')}</div>
    <div class="lf-chip st__ok">${esc(result)}</div>
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const layer = pick(f, '.lf-pointer-layer')
  const track = pick(f, `.st__track[data-i="${target}"]`), thumb = pick(track, '.st__thumb')
  const travel = track.clientWidth - thumb.clientWidth - 2 * thumb.offsetLeft || 1
  // rows: the card, its rows, the pointer arriving at the switch (its centre in % of the frame)
  a.enter('.st', 0)
  a.enter('.st__row', 0.15, { stagger: 0.04 })
  const tx = 27 + 46 - 2.4 - 2.8, ty = TOP + ROW * target + ROW / 2
  gsap.set(layer, { xPercent: 90, yPercent: 95, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.3)
  a.point(layer, Math.max(0.35, s(1) - 0.65), tx, ty)
  // press: anticipation squash, slide with overshoot, accent on landing, ring
  const t = s(1)
  a.click('.lf-pointer', '.lf-pointer__ring', undefined, t)
  tl.to(thumb, { scaleX: 1.25, duration: 0.12, ease: 'power2.out' }, t)
  tl.to(thumb, { x: travel * 1.04, scaleX: 1.1, duration: 0.28, ease: 'power3.out' }, t + 0.12)
  tl.to(thumb, { x: travel, scaleX: 1, duration: 0.2, ease: 'power2.inOut' }, t + 0.4)
  tl.to(track, { backgroundColor: color('accent'), duration: 0.15 }, t + 0.32)
  // done: the confirmation, then the pointer steps aside
  a.enter('.st__ok', s(2) + 0.05)
  a.point(layer, s(2) + 0.2, 82, 80)
  return tl
})
