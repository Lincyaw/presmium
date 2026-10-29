import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, speed } from '../../../lengths/scenes/kit/fx/time.ts'
import { axisBlur, beats, DEFS_CSS, esc, panel, sineInOut, span, type Panel } from './lib/stage.ts'

// Pan across stations, with defineScene: the camera moves along a row of stations on one rail and stops at each. One state
// per station, `station-1` … (1.4 s each). `station-1`: the row fades in over 0.45 s (power2.out) on the first
// station. Each later state opens with a 0.25 s pan of one station's spacing (50 cqw) on sine.inOut, then dwells
// for the rest of the state, dead still, so the station can be read. During the pan the row blurs along x with the
// speed (to 0.5 cqw at the middle of the move) and the rail's progress line grows on the same ease; the light
// (full opacity, accent outline and number) stays on the station being left until the camera lands, then moves to
// the new one, the others resting at 45%: cause, then effect. The neighbours stay in view at the edges, so the row reads as one continuous place. Use for a
// pipeline, a sequence of steps or a tour of features; the dwell is the state's length, so narration sets it.
// Adapted from HyperFrames pan-stations.
const SPACING = 50       // cqw between station centres
const PAN = 0.25, IN = 0.45
const PEAK_BLUR = 0.5    // cqw

export default defineScene(ctx => {
  const { root, parameters, width } = ctx
  const given = Array.isArray(parameters.stations) ? (parameters.stations as unknown[]).map(s => panel(s, { title: '' })).filter(s => s.title) : []
  const stations: Panel[] = given.length ? given : [
    { title: '数据清洗', line: '去重、过滤低质量文本' },
    { title: '分词', line: '把文本切成子词' },
    { title: '预训练', line: '预测下一个词' },
    { title: '指令微调', line: '学会按要求回答' },
    { title: '评测', line: '在留出集上打分' },
  ]
  const n = stations.length
  const el = frame(root, `${DEFS_CSS}
    .ps { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .ps__row { position: absolute; left: 0; top: 0; width: ${n * SPACING + 50}cqw; height: 100cqh; }
    .ps__rail { position: absolute; left: 50cqw; top: 80cqh; width: ${(n - 1) * SPACING}cqw; height: 0.4cqh; background: var(--pm-color-line); border-radius: 1cqh; }
    .ps__fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--pm-color-accent); border-radius: inherit; }
    .ps__st { position: absolute; top: 20cqh; width: 40cqw; height: 48cqh; margin-left: -20cqw; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2cqh; text-align: center; }
    .ps__ring { position: absolute; inset: 0; border-radius: inherit; border: 0.3cqw solid var(--pm-color-accent); opacity: 0; }
    .ps__num { position: absolute; top: 76.5cqh; width: 7.5cqh; height: 7.5cqh; margin-left: -3.75cqh; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: var(--pm-color-surface); border: 0.25cqw solid var(--pm-color-line-strong); font: 600 2.2cqw/1 var(--pm-font-mono); color: var(--pm-color-muted); }
    .ps__num--on { background: var(--pm-color-accent); border-color: var(--pm-color-accent); color: var(--pm-color-on-accent); }
    .ps__st .lf-title { font-size: 4.6cqw; }
    .ps__st .lf-lead { font-size: 2.4cqw; font-weight: 400; color: var(--pm-color-muted); }
  `, `<div class="ps"><div class="ps__row"><div class="ps__rail"><div class="ps__fill"></div></div>
     ${stations.map((s, i) => `<div class="lf-card ps__st" style="left: ${50 + i * SPACING}cqw">
       ${s.kicker ? `<div class="lf-chip">${esc(s.kicker)}</div>` : ''}<div class="lf-title">${esc(s.title)}</div>${s.line ? `<div class="lf-lead">${esc(s.line)}</div>` : ''}<div class="ps__ring"></div></div>
       <div class="ps__num" style="left: ${50 + i * SPACING}cqw">${i + 1}</div>`).join('')}</div></div>`)
  const stage = pick(el, '.ps'), row = pick(el, '.ps__row'), fill = pick(el, '.ps__fill')
  const cards = [...el.querySelectorAll<HTMLElement>('.ps__st')], nums = [...el.querySelectorAll<HTMLElement>('.ps__num')]
  const rings = cards.map(c => pick(c, '.ps__ring'))
  const blur = axisBlur(el, row, width, 'x')
  const { at, len } = beats(ctx)
  const pan = sineInOut, fade = ease.out3
  const states = Math.min(n, ctx.durations.length)

  return (ms: number) => {
    const t = ms / 1000
    stage.style.opacity = fade(span(t, 0, Math.min(IN, len(0) || IN))).toFixed(3)
    // Which station the camera is at or moving to, and how far along the pan.
    let k = 0
    while (k + 1 < states && t >= at(k + 1)) k++
    const p = k === 0 ? 1 : span(t, at(k), Math.min(PAN, len(k) || PAN))
    const pos = k === 0 ? 0 : k - 1 + pan(p)
    row.style.transform = `translateX(${(-pos * SPACING).toFixed(3)}cqw)`
    blur(p > 0 && p < 1 ? (PEAK_BLUR * speed(pan, p)) / speed(pan, 0.5) : 0)
    fill.style.width = `${n > 1 ? (100 * pos) / (n - 1) : 0}%`
    const here = p >= 1 ? k : k - 1        // the station lit: the one arrived at, or the one being left
    cards.forEach((c, i) => {
      c.style.opacity = i === here ? '1' : '0.45'
      rings[i]!.style.opacity = i === here ? '1' : '0'
      nums[i]!.classList.toggle('ps__num--on', i <= here)
    })
  }
})
