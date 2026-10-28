import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../kit/frame.ts'

// A paper's key result in five seconds, with Motion. `setup`: what is compared (the two rows and the metric).
// `baseline`: the previous best grows first, so the viewer has the reference before the claim. `ours`: the new
// result grows past it. `delta`: the gain is named in one chip (a spring, the only bouncy thing), the source fades
// in under it, and the rest is a hold. The chip springs inside a wrapper that places it, as Motion's scale replaces
// the element's own CSS transform. The bars start at zero: a cut axis would make a 7% gain look like 50%.
interface Row { label: string, value: number }

export default motionScene(({ root, motion, at, parameters }) => {
  const metric = (parameters.metric as string | undefined) ?? 'WMT 2014 英德翻译 · BLEU'
  const rows = (parameters.rows as Row[] | undefined) ?? [{ label: '此前最佳 · ConvS2S 集成', value: 26.36 }, { label: 'Transformer（big）', value: 28.4 }]
  const max = (parameters.max as number | undefined) ?? 30
  const delta = (parameters.delta as string | undefined) ?? '+2.0 BLEU'
  const source = (parameters.source as string | undefined) ?? '数据：Vaswani et al., 2017，表 2'
  const f = frame(root, `
    .kr { position: absolute; left: 10cqw; right: 10cqw; top: 18cqh; display: grid; grid-template-columns: 24cqw 1fr; row-gap: 7cqh; column-gap: 2cqw; align-items: center; }
    .kr__metric { grid-column: 1 / -1; font-size: 2.4cqw; font-weight: 600; color: var(--pm-color-muted); }
    .kr__label { font-size: 2.3cqw; font-weight: 600; text-align: right; white-space: nowrap; }
    .kr__track { position: relative; height: 9cqh; border-radius: 0.6cqw; background: var(--pm-color-sunk); }
    .kr__bar { position: absolute; inset: 0; border-radius: 0.6cqw; transform-origin: left; transform: scaleX(0); background: var(--pm-color-line-strong); }
    .kr__row--ours .kr__bar { background: var(--pm-color-accent); }
    .kr__value { position: absolute; left: 0; top: 50%; transform: translateY(-50%); padding-left: 1cqw; font: 500 3cqw/1 var(--pm-font-mono); color: var(--pm-color-ink); white-space: nowrap; }
    .kr__deltapos { position: absolute; top: 100%; transform: translate(-60%, 35%); }
    .kr__delta { background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-size: 2.6cqw; }
    .kr__source { position: absolute; left: 0; right: 0; top: 82cqh; text-align: center; }
  `, `<div class="kr">
    <div class="kr__metric">${metric}</div>
    ${rows.map((row, i) => `<div class="kr__label">${row.label}</div>
      <div class="kr__track kr__row--${i === rows.length - 1 ? 'ours' : 'base'}"><div class="kr__bar"></div>
        <div class="kr__value">0</div>${i === rows.length - 1 ? `<div class="kr__deltapos" style="left:${(row.value / max) * 100}%"><span class="lf-chip kr__delta">${delta}</span></div>` : ''}</div>`).join('')}
  </div><div class="lf-caption kr__source">${source}</div>`)
  const S = (k: number) => at(k) / 1000
  const out: [number, number, number, number] = [0.33, 1, 0.68, 1]
  const labels = [...f.querySelectorAll<HTMLElement>('.kr__label')]
  const tracks = [...f.querySelectorAll<HTMLElement>('.kr__track')]
  const bars = [...f.querySelectorAll<HTMLElement>('.kr__bar')]
  const values = [...f.querySelectorAll<HTMLElement>('.kr__value')]
  const decimals = (v: number) => (Number.isInteger(v * 10) ? 1 : 2)
  // One motion value per number; its text is written when it changes and once now.
  const counters = rows.map((row, i) => {
    const value = motion.motionValue(0)
    // The number rides the end of its bar: both follow the same value.
    value.on('change', v => {
      values[i]!.textContent = v.toFixed(decimals(row.value))
      values[i]!.style.left = `${(v / max) * 100}%`
    })
    values[i]!.textContent = (0).toFixed(decimals(row.value))
    return value
  })
  const seq: MotionSequence = [
    [f.querySelector('.kr__metric')!, { opacity: [0, 1] }, { at: S(0), duration: 0.3 }],
    [labels, { opacity: [0, 1], x: ['-12%', '0%'] }, { at: S(0) + 0.1, duration: 0.45, delay: motion.stagger(0.08), ease: [0.16, 1, 0.3, 1] }],
    [tracks, { opacity: [0, 1] }, { at: S(0) + 0.2, duration: 0.3, delay: motion.stagger(0.08) }],
    [pick(f, '.kr__source'), { opacity: [0, 0] }, { at: S(0), duration: 0.01 }],
  ]
  rows.forEach((row, i) => {
    const k = i === rows.length - 1 ? 2 : 1
    const t = S(k) + (k === 1 ? i * 0.25 : 0)
    seq.push([bars[i]!, { scaleX: [0, row.value / max] }, { at: t, duration: 0.9, ease: out }])
    seq.push([counters[i]!, row.value, { at: t, duration: 0.9, ease: out }])
    seq.push([values[i]!, { opacity: [0, 1] }, { at: t, duration: 0.2 }])
  })
  const chip = f.querySelector<HTMLElement>('.kr__delta')
  if (chip) seq.push([chip, { scale: [0, 1], opacity: [0, 1] }, { at: S(3), type: 'spring', bounce: 0.5, visualDuration: 0.35 }])
  seq.push([pick(f, '.kr__source'), { opacity: [0, 1] }, { at: S(3) + 0.4, duration: 0.4 }])
  return motion.animate(seq)
})
