import { gsapScene } from '@lincyaw/addon-motion/scene'

// CSS variables: GSAP tweens `--p0`..`--p3` on one element and CSS does the rest: a conic-gradient pie and the
// bars' widths both read the same variables. This shows softmax at three temperatures.
// The variables are set at build time (gsap.set) so the first tween has a start value to read.
const LOGITS = [2.0, 1.0, 0.4, -0.5]
const LABELS = ['猫', '狗', '狐', '车']
const softmax = (t: number) => {
  const e = LOGITS.map(z => Math.exp(z / t))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map(x => x / sum)
}
const vars = (p: number[]) => Object.fromEntries(p.map((v, i) => [`--p${i}`, v]))

export default gsapScene(({ root, gsap, at }) => {
  const C = ['var(--pm-color-accent)', 'var(--pm-color-warn)', 'var(--pm-color-danger)', 'var(--pm-color-line-strong)']
  // The pie's stops are running sums of the variables.
  const stops = C.map((c, i) => `${c} 0 calc((${Array.from({ length: i + 1 }, (_, j) => `var(--p${j})`).join(' + ')}) * 1turn)`).join(', ')
  root.innerHTML = `
    <style>
      .cv { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1.3fr; align-items: center; gap: 2rem; padding: 0 8%; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .cv__pie { width: 75%; aspect-ratio: 1; justify-self: center; border-radius: 50%; background: conic-gradient(${stops}); }
      .cv__row { display: grid; grid-template-columns: 2rem 1fr; align-items: center; gap: 0.6rem; margin: 0.7rem 0; }
      .cv__bar { height: 1.4rem; border-radius: 0.3rem; }
      .cv__t { grid-column: 1 / -1; font: 600 1.3rem var(--pm-font-mono); margin-bottom: 0.8rem; }
    </style>
    <div class="cv">
      <div class="cv__pie"></div>
      <div>
        <div class="cv__t">softmax(z / T)，T = <span class="cv__temp">1.0</span></div>
        ${LABELS.map((l, i) => `<div class="cv__row"><span>${l}</span><div class="cv__bar" style="background:${C[i]};width:calc(var(--p${i}) * 100%)"></div></div>`).join('')}
      </div>
    </div>`
  const s = (k: number) => at(k) / 1000
  const box = root.querySelector('.cv')!
  const temp = root.querySelector('.cv__temp')!
  gsap.set(box, vars(softmax(1)))
  const tl = gsap.timeline({ defaults: { duration: 1, ease: 'power2.inOut' } })
  // Step 0: T = 1, the plain softmax (already set); the pie turns in.
  tl.from('.cv__pie', { rotation: -90, scale: 0.6, opacity: 0, duration: 0.8 }, s(0))
  // Step 1: T = 0.3: the largest logit takes almost everything.
  tl.to(box, vars(softmax(0.3)), s(1))
  tl.to(temp, { textContent: 0.3, modifiers: { textContent: (v: number) => Number(v).toFixed(1) } }, s(1))
  // Step 2: T = 5: close to uniform.
  tl.to(box, vars(softmax(5)), s(2))
  tl.to(temp, { textContent: 5, modifiers: { textContent: (v: number) => Number(v).toFixed(1) } }, s(2))
  return tl
})
