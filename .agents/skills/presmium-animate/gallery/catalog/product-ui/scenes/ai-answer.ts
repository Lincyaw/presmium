import { gsapScene } from '@lincyaw/addon-motion/scene'
import { hash } from '../../../lengths/scenes/kit/fx/random.ts'
import { atoms, esc, frame, list, pick, shadow, str } from './lib/ui.ts'

// AI answer: a question is asked in a generic assistant panel and the answer streams in. States `ask`, `think`,
// `answer`, `hold`. `ask`: the input takes the focus, the question is typed at 14 characters a second behind a
// steady caret, and 0.35 s before the state ends the send button is pressed. `think` (0.9 s): 0–0.45 s the
// question lifts out of the input into its bubble at the top (the same text moving, not a copy fading in), then
// the assistant's mark appears with three dots that pulse in turn. `answer`: the dots give way to the answer,
// which arrives as a model streams, in uneven bursts of one to four characters with short seeded pauses (the
// same on every build), each burst landing grey and inking to full colour in 0.25 s, the lead sentence, then
// the points one per line; the stream is fitted to the state. `hold` (2 s): the last burst inks, a quiet row of
// actions appears; hold. No product's look: the mark is a neutral four-point star. Adapted from HyperFrames
// streaming-text (with ai-chat-reveal, typed-prompt, chatgpt-exchange and claude-exchange, minus their brands).

export default gsapScene(({ root, gsap, at, durations, color, parameters }) => {
  const name = str(parameters, 'name', '课程助教')
  const prompt = str(parameters, 'prompt', '用一句话解释什么是过拟合？')
  const lead = str(parameters, 'answer', '过拟合是模型把训练数据里的噪声也当成了规律。')
  const points = list<string>(parameters, 'points', ['训练误差很低，测试误差却很高', '常见原因：模型太复杂、数据太少', '对策：正则化、早停、增加数据'])
  // the answer as bursts of 1–4 characters (Latin words stay whole), seeded so every build streams the same way
  const bursts = (text: string, seed: number) => {
    const out: string[] = []
    let i = 0, k = 0
    while (i < text.length) {
      const word = /^[A-Za-z0-9.]+/.exec(text.slice(i))
      const n = word ? word[0].length : 1 + Math.floor(hash(seed, k) * 4)
      out.push(text.slice(i, i + n)); i += n; k += 1
    }
    return out
  }
  const span = (parts: string[]) => parts.map(p => `<span class="aa__tok">${esc(p)}</span>`).join('')
  const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 C12.8 8 16 11.2 22 12 C16 12.8 12.8 16 12 22 C11.2 16 8 12.8 2 12 C8 11.2 11.2 8 12 2 Z" fill="currentColor" /></svg>'
  const f = frame(root, `
    .aa { position: absolute; left: 17cqw; top: 5cqh; width: 66cqw; height: 88cqh; border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.6)}; overflow: hidden; }
    .aa__head { height: 9cqh; display: flex; align-items: center; gap: 0.9cqw; padding: 0 2.2cqw; border-bottom: 0.15cqw solid var(--pm-color-line); font-size: 1.7cqw; font-weight: 600; }
    .aa__mark { width: 2.6cqw; height: 2.6cqw; display: grid; place-items: center; border-radius: 50%; background: var(--pm-color-accent-soft); color: var(--pm-color-accent); flex: none; }
    .aa__mark svg { width: 62%; height: 62%; }
    .aa__q { position: absolute; right: 2.4cqw; top: 13cqh; max-width: 70%; padding: 1.6cqh 1.4cqw; border-radius: 1.4cqw; border-bottom-right-radius: 0.4cqw; background: var(--pm-color-sunk); font-size: 2.2cqw; }
    .aa__a { position: absolute; left: 2.4cqw; right: 3cqw; top: 25cqh; display: flex; gap: 1.2cqw; }
    .aa__body { flex: 1; display: flex; flex-direction: column; gap: 2cqh; font-size: 2.4cqw; line-height: 1.5; }
    .aa__lead { font-weight: 600; }
    .aa__body ul { margin: 0; padding-left: 2.2cqw; display: flex; flex-direction: column; gap: 1cqh; }
    .aa__body li::marker { color: var(--pm-color-accent); }
    .aa__dots { position: absolute; left: 4cqw; top: 0.6cqh; display: flex; gap: 0.5cqw; }
    .aa__dots i { width: 0.8cqw; height: 0.8cqw; border-radius: 50%; background: var(--pm-color-muted); }
    .aa__acts { display: flex; gap: 1.2cqw; font-size: 1.4cqw; color: var(--pm-color-muted); }
    .aa__acts span { padding: 0.4cqh 1cqw; border-radius: 99cqw; border: 0.15cqw solid var(--pm-color-line); }
    .aa__input { position: absolute; left: 2.4cqw; right: 2.4cqw; bottom: 3cqh; height: 10cqh; display: flex; align-items: center; gap: 1cqw; padding: 0 1cqw 0 1.6cqw; border-radius: 99cqw; border: 0.15cqw solid var(--pm-color-line-strong); font-size: 1.9cqw; }
    .aa__field { flex: 1; white-space: nowrap; overflow: hidden; }
    .aa__ph { position: absolute; left: 1.6cqw; color: var(--pm-color-muted); }
    .aa__caret { display: inline-block; width: 0.16cqw; height: 3.6cqh; margin-left: 0.1cqw; vertical-align: middle; background: var(--pm-color-accent); opacity: 0; }
    .aa__send { width: 4.4cqw; height: 4.4cqw; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--pm-color-line-strong); color: var(--pm-color-on-accent); }
    .aa__send svg { width: 50%; height: 50%; }
  `, `
    <div class="aa">
      <div class="aa__head"><span class="aa__mark">${star}</span>${esc(name)}</div>
      <div class="aa__q">${esc(prompt)}</div>
      <div class="aa__a"><span class="aa__mark aa__amark">${star}</span><div class="aa__dots"><i></i><i></i><i></i></div>
        <div class="aa__body"><div class="aa__lead">${span(bursts(lead, 1))}</div><ul>${points.map((p, i) => `<li>${span(bursts(p, i + 2))}</li>`).join('')}</ul><div class="aa__acts"><span>复制</span><span>重新回答</span><span>追问</span></div></div></div>
      <div class="aa__input"><span class="aa__ph">输入你的问题…</span><span class="aa__field"><span class="aa__typed"></span><i class="aa__caret"></i></span>
        <span class="aa__send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19 V5 M6 11 L12 5 L18 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg></span></div>
    </div>`)
  const s = (k: number) => at(k) / 1000
  const len = (k: number) => (durations[k] ?? 1000) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const input = pick(f, '.aa__input'), q = pick(f, '.aa__q'), send = pick(f, '.aa__send')
  // ask: focus, typing, the send button lights as soon as there is text, the press
  a.enter('.aa', 0, { from: 'fade', duration: 0.3 })
  tl.to(input, { borderColor: color('accent'), duration: 0.12 }, 0.2)
  tl.set('.aa__caret', { opacity: 1 }, 0.25)
  tl.set('.aa__ph', { autoAlpha: 0 }, 0.3)
  const cps = Math.max(14, prompt.length / Math.max(0.4, len(0) - 0.9))
  a.type('.aa__typed', prompt, 0.3, { cps })
  tl.to(send, { backgroundColor: color('accent'), duration: 0.15 }, 0.35)
  const press = s(1) - 0.35
  tl.to(send, { keyframes: [{ scale: 0.88, duration: 0.1, ease: 'power2.out' }, { scale: 1, duration: 0.25, ease: 'back.out(2)' }] }, press)
  // think: the typed question lifts into its bubble (it starts where the input text is), the input empties
  const t1 = s(1)
  const dx = input.offsetLeft + 1.6 * (f.clientWidth / 100) - q.offsetLeft
  const dy = input.offsetTop + (input.offsetHeight - q.offsetHeight) / 2 - q.offsetTop
  gsap.set(q, { autoAlpha: 0, x: dx, y: dy, backgroundColor: color('surface') })
  tl.set(q, { autoAlpha: 1 }, t1)
  tl.set(['.aa__typed', '.aa__caret'], { autoAlpha: 0 }, t1)
  tl.to(q, { x: 0, y: 0, duration: 0.45, ease: 'power3.inOut' }, t1)
  tl.to(q, { backgroundColor: color('sunk'), duration: 0.2 }, t1 + 0.3)
  tl.to(input, { borderColor: color('line-strong'), duration: 0.2 }, t1 + 0.1)
  tl.to(send, { backgroundColor: color('line-strong'), duration: 0.2 }, t1 + 0.1)
  tl.set('.aa__ph', { autoAlpha: 1 }, t1 + 0.1)
  a.enter('.aa__amark', t1 + 0.45, { from: 'scale', duration: 0.3 })
  gsap.set('.aa__dots', { autoAlpha: 0 })
  tl.set('.aa__dots', { autoAlpha: 1 }, t1 + 0.55)
  const pulses = Math.max(1, Math.round((len(1) - 0.55) / 0.45))
  tl.fromTo('.aa__dots i', { opacity: 0.25 }, { opacity: 1, duration: 0.2, ease: 'sine.inOut', stagger: { each: 0.12, repeat: pulses * 2 - 1, yoyo: true }, immediateRender: false }, t1 + 0.55)
  // answer: bursts on a seeded rhythm, each landing grey and inking
  const t2 = s(2)
  tl.set('.aa__dots', { autoAlpha: 0 }, t2)
  const toks = [...f.querySelectorAll<HTMLElement>('.aa__tok')]
  const gaps = toks.map((_, i) => 0.6 + hash(7, i) * 0.8 + (hash(9, i) > 0.9 ? 2.5 : 0))
  const sum = gaps.reduce((x, y) => x + y, 0)
  const room = Math.max(0.5, len(2) - 0.3)
  gsap.set(toks, { opacity: 0, color: color('muted') })
  gsap.set('.aa__body li', { autoAlpha: 0 })
  let t = t2
  toks.forEach((tok, i) => {
    t += (gaps[i]! / sum) * room
    const li = tok.closest('li')
    if (li && tok === li.querySelector('.aa__tok')) tl.set(li, { autoAlpha: 1 }, t)
    tl.set(tok, { opacity: 1 }, t)
    tl.to(tok, { color: color('ink'), duration: 0.25, ease: 'power1.out' }, t)
  })
  // hold: the actions
  a.enter('.aa__acts', s(3) + 0.2, { from: 'fade', duration: 0.3 })
  return tl
})
