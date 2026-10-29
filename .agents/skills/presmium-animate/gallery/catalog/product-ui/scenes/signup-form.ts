import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, esc, frame, num, pick, POINTER, POINTER_CSS, shadow, str } from './lib/ui.ts'

// Sign-up form: a generic sign-up card is filled in and sent. States `form`, `email`, `password`, `submit`,
// `done`. `form` (0.9 s): the card rises, its parts follow 50 ms apart. `email` (1.5 s): the field takes the
// accent edge (focus first, then the typing), the address is typed at 14 characters a second behind a caret
// that blinks only while it waits. `password` (1 s): the focus moves down, the dots are typed. `submit` (1 s):
// the pointer travels to the button and presses it (0.5 s), the label gives way to a turning spinner. `done`
// (1.8 s): the button floods with the success colour from its centre and a check replaces the spinner, a
// welcome line rises under the card; hold. Typing never runs past its state: a long address types faster.
// Adapted from HyperFrames signup-flow.

export default gsapScene(({ root, gsap, at, durations, color, parameters }) => {
  const title = str(parameters, 'title', '创建账号')
  const sub = str(parameters, 'subtitle', '开始写你的第一份讲义')
  const provider = str(parameters, 'provider', '用学校账号继续')
  const email = str(parameters, 'email', 'lin@example.edu')
  const dots = '•'.repeat(Math.max(4, Math.min(14, num(parameters, 'passwordLength', 10))))
  const button = str(parameters, 'button', '注册')
  const welcome = str(parameters, 'result', '欢迎！确认邮件已发出')
  const f = frame(root, `
    ${POINTER_CSS}
    .sf__wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4cqh; }
    .sf { position: relative; width: 38cqw; padding: 3.4cqh 2.8cqw; display: flex; flex-direction: column; gap: 2.2cqh; border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.6)}; }
    .sf__title { font: 600 3cqw/1.1 var(--pm-font-serif); }
    .sf__sub { font-size: 1.6cqw; color: var(--pm-color-muted); margin-top: -1cqh; }
    .sf__btn { position: relative; height: 7.6cqh; display: grid; place-items: center; border-radius: 0.9cqw; font-size: 1.8cqw; font-weight: 600; overflow: hidden; }
    .sf__alt { border: 0.15cqw solid var(--pm-color-line-strong); color: var(--pm-color-ink); }
    .sf__or { display: flex; align-items: center; gap: 1cqw; font-size: 1.3cqw; color: var(--pm-color-muted); }
    .sf__or::before, .sf__or::after { content: ''; flex: 1; height: 0.15cqw; background: var(--pm-color-line); }
    .sf__field { display: flex; flex-direction: column; gap: 0.8cqh; }
    .sf__lab { font-size: 1.4cqw; color: var(--pm-color-muted); }
    .sf__input { height: 7cqh; display: flex; align-items: center; padding: 0 1.2cqw; border-radius: 0.9cqw; border: 0.15cqw solid var(--pm-color-line-strong); font: 1.7cqw var(--pm-font-mono); white-space: pre; }
    .sf__caret { display: inline-block; width: 0.18cqw; height: 3.4cqh; margin-left: 0.15cqw; background: var(--pm-color-accent); opacity: 0; }
    .sf__go { background: var(--pm-color-accent); color: var(--pm-color-on-accent); margin-top: 1cqh; }
    .sf__flood { position: absolute; left: 50%; top: 50%; width: 120%; aspect-ratio: 1; margin: -60% 0 0 -60%; border-radius: 50%; background: var(--pm-color-ok); transform: scale(0); }
    .sf__label, .sf__spin, .sf__check { position: absolute; inset: 0; display: grid; place-items: center; }
    .sf__spin i { width: 3.6cqh; height: 3.6cqh; border-radius: 50%; border: 0.25cqw solid ${'color-mix(in srgb, var(--pm-color-on-accent) 35%, transparent)'}; border-top-color: var(--pm-color-on-accent); }
    .sf__check svg { width: 4.4cqh; height: 4.4cqh; }
  `, `
    <div class="sf__wrap"><div class="sf">
      <div class="sf__title">${esc(title)}</div><div class="sf__sub">${esc(sub)}</div>
      <div class="sf__btn sf__alt">${esc(provider)}</div>
      <div class="sf__or">或</div>
      <div class="sf__field"><span class="sf__lab">邮箱</span><div class="sf__input sf__email"><span class="sf__t1"></span><i class="sf__caret sf__c1"></i></div></div>
      <div class="sf__field"><span class="sf__lab">密码</span><div class="sf__input sf__pw"><span class="sf__t2"></span><i class="sf__caret sf__c2"></i></div></div>
      <div class="sf__btn sf__go"><i class="sf__flood"></i><span class="sf__label">${esc(button)}</span><span class="sf__spin"><i></i></span>
        <span class="sf__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="sf__tick" d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="var(--pm-color-on-accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span></div>
    </div>
    <div class="lf-body sf__welcome">${esc(welcome)}</div></div>
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const len = (k: number) => (durations[k] ?? 1000) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const layer = pick(f, '.lf-pointer-layer'), go = pick(f, '.sf__go')
  // form
  a.enter('.sf', 0)
  a.enter('.sf > *', 0.12, { stagger: 0.05 })
  // a blinking caret while waiting, steady while typing
  const blink = (caret: string, from: number, to: number) => {
    tl.set(caret, { opacity: 1 }, from)
    for (let t = from + 0.5; t < to - 0.05; t += 0.5) tl.set(caret, { opacity: Math.round((t - from) / 0.5) % 2 ? 0 : 1 }, t)
    tl.set(caret, { opacity: 0 }, to)
  }
  const type = (target: string, value: string, t: number, room: number) => {
    const cps = Math.max(14, value.length / Math.max(0.3, room))
    return a.type(target, value, t, { cps })
  }
  // email: focus, then typing
  const t1 = s(1)
  tl.to('.sf__email', { borderColor: color('accent'), duration: 0.12 }, t1)
  const typed1 = type('.sf__t1', email, t1 + 0.15, len(1) - 0.45)
  tl.set('.sf__c1', { opacity: 1 }, t1 + 0.1)
  blink('.sf__c1', typed1, s(2))
  // password
  const t2 = s(2)
  tl.to('.sf__email', { borderColor: color('line-strong'), duration: 0.12 }, t2)
  tl.to('.sf__pw', { borderColor: color('accent'), duration: 0.12 }, t2)
  tl.set('.sf__c2', { opacity: 1 }, t2 + 0.1)
  const typed2 = type('.sf__t2', dots, t2 + 0.12, len(2) - 0.35)
  blink('.sf__c2', typed2, s(3))
  // submit: pointer travels and presses, the label gives way to a spinner
  const t3 = s(3)
  // the button's point in % of the frame, from offsets (transforms of the entrance do not count)
  const card = pick(f, '.sf')
  const bx = ((card.offsetLeft + go.offsetLeft + go.offsetWidth * 0.55) / (f.clientWidth || 1)) * 100
  const by = ((card.offsetTop + go.offsetTop + go.offsetHeight * 0.6) / (f.clientHeight || 1)) * 100
  gsap.set(layer, { xPercent: 88, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.15 }, t3 - 0.1)
  a.point(layer, t3, bx, by, { duration: 0.45 })
  a.click('.lf-pointer', '.lf-pointer__ring', go, t3 + 0.5)
  gsap.set(['.sf__spin', '.sf__check'], { autoAlpha: 0 })
  tl.to('.sf__label', { autoAlpha: 0, yPercent: -30, duration: 0.2, ease: 'power2.in' }, t3 + 0.6)
  tl.to('.sf__spin', { autoAlpha: 1, duration: 0.15 }, t3 + 0.72)
  tl.fromTo('.sf__spin i', { rotation: 0 }, { rotation: 360 * 2 * (len(3) - 0.72 + 0.2), duration: len(3) - 0.72 + 0.2, ease: 'none', immediateRender: false }, t3 + 0.72)
  // done: flood to success, check, welcome
  const t4 = s(4)
  tl.to('.sf__flood', { scale: 1, duration: 0.45, ease: 'power2.out' }, t4)
  tl.to('.sf__spin', { autoAlpha: 0, duration: 0.1 }, t4 + 0.1)
  tl.set('.sf__check', { autoAlpha: 1 }, t4 + 0.2)
  a.draw('.sf__tick', t4 + 0.2, { duration: 0.35 })
  a.emphasize(go, t4 + 0.45, { scale: 1.03 })
  a.point(layer, t4 + 0.1, 80, 82)
  a.enter('.sf__welcome', t4 + 0.55)
  return tl
})
