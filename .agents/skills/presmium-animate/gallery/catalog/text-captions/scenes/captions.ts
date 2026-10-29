import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc, pieces, readSeconds } from './lib/text.ts'

// Captions, with GSAP: narration shown phrase by phrase, each word marked as it is spoken. Four looks, by `style`:
//   karaoke   — the whole phrase is shown in the muted colour and each word turns ink as it is spoken; key words
//               turn accent with one small punch (grow 6% and settle);
//   pill      — the phrase sits on a card and a soft accent pill marks the word being spoken;
//   editorial — words rise in as they are spoken; key words are set in the serif, half again as large, accent;
//   wipe      — words are uncovered left to right by a clip as they are spoken.
// Words come from the dictionary segmenter, so Chinese phrases split into words without spaces.
// One state `play`. The phrases share the state in proportion to their length, after 1.2 s are kept for the last
// phrase to rest. In each phrase's window: 0–0.3 s it rises 30% into place (expo.out, the enter of the atoms);
// from 0.15 s its words are marked at an even rate per character, which is the pace of speech, up to 0.35 s
// before the window ends; the last 0.22 s it leaves upwards, accelerating, and the next one rises into the same
// place (a replace: the exit and the entrance overlap by a third). The last phrase stays and rests.
// Reading speed: the scene does not stretch time. Give the state at least twice the reading time (9 Chinese or
// 20 Latin characters a second) of all phrases; the default 20 characters in 6 s show 3.3 characters a second.
// Captions for a narrated video: put `position: bottom` and lay the scene over the shot.
// Adapted from HyperFrames caption-pill-karaoke, caption-editorial-emphasis, caption-clip-wipe,
// caption-weight-shift, caption-gradient-fill and caption-neon-accent.
type Style = 'karaoke' | 'pill' | 'editorial' | 'wipe'

export default gsapScene(({ root, gsap, total, color, parameters }) => {
  const phrases = (parameters.phrases as string[] | undefined) ?? ['梯度告诉我们', '往哪个方向走，', '损失下降得最快']
  const keywords = (parameters.keywords as string[] | undefined) ?? ['方向', '最快']
  const style = ((parameters.style as string | undefined) ?? 'karaoke') as Style
  const bottom = parameters.position === 'bottom'
  const isKey = (w: string) => {
    const bare = w.replace(/[\p{P}\s]/gu, '')
    return bare.length > 0 && keywords.some(k => k && (bare.includes(k) || k.includes(bare)))
  }
  frame(root, `
    .cp { position: absolute; inset: 0; display: grid; place-items: ${bottom ? 'end center' : 'center'}; padding-bottom: ${bottom ? '9cqh' : '0'}; }
    .cp-phrase { grid-area: 1 / 1; white-space: nowrap; font: 600 ${TYPE.lead}cqw/1.3 var(--pm-font-sans); }
    .cp--pill .cp-phrase { padding: 0.5em 0.7em; border-radius: 1.4cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); }
    .cp-w { display: inline-block; border-radius: 0.6cqw; }
    .cp--pill .cp-w { padding-inline: 0.12em; margin-inline: -0.12em; }
    .cp--editorial .cp-phrase { font-weight: 500; }
    .cp--editorial .cp-key { font: 600 1.5em/1 var(--pm-font-serif); color: var(--pm-color-accent); vertical-align: -0.08em; padding-inline: 0.06em; }
  `, `<div class="cp cp--${style}">${phrases.map(p => `<div class="cp-phrase">${pieces(p, 'word').map(w => w.space
    ? esc(w.text)
    : `<span class="cp-w${isKey(w.text) ? ' cp-key' : ''}" data-n="${[...w.text].length}">${esc(w.text)}</span>`).join('')}</div>`).join('')}</div>`)

  const tl = gsap.timeline()
  const T = total / 1000
  const nodes = [...root.querySelectorAll<HTMLElement>('.cp-phrase')]
  const weights = phrases.map(p => Math.max(readSeconds(p), 0.3))
  const sum = weights.reduce((a, b) => a + b, 0)
  const avail = Math.max(0.5, T - 1.2)
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), soft = color('accent-soft')
  let a = 0
  gsap.set(nodes, { autoAlpha: 0, yPercent: 30 })
  nodes.forEach((node, i) => {
    const last = i === nodes.length - 1
    const b = last ? avail : a + (avail * weights[i]!) / sum
    tl.to(node, { autoAlpha: 1, yPercent: 0, duration: 0.3, ease: 'expo.out' }, i === 0 ? 0.05 : a)
    // Words are marked at the pace of speech: an even time per character across the phrase.
    const words = [...node.querySelectorAll<HTMLElement>('.cp-w')]
    const chars = words.reduce((n, w) => n + Number(w.dataset.n), 0)
    const from = a + 0.15, until = b - 0.35
    let c = 0
    const times = words.map(w => { const t = from + ((until - from) * c) / chars; c += Number(w.dataset.n); return t })
    words.forEach((w, j) => {
      const t = times[j]!, key = w.classList.contains('cp-key')
      if (style === 'karaoke') {
        gsap.set(w, { color: muted })
        tl.to(w, { color: key ? accent : ink, duration: 0.12, ease: 'power1.out' }, t)
        if (key) tl.to(w, { keyframes: [{ scale: 1.06, duration: 0.15, ease: 'power2.out' }, { scale: 1, duration: 0.4, ease: 'back.out(2)' }] }, t)
      } else if (style === 'pill') {
        gsap.set(w, { backgroundColor: 'rgba(0,0,0,0)', color: ink })
        tl.to(w, { backgroundColor: soft, color: accent, duration: 0.12, ease: 'power1.out' }, t)
        const next = times[j + 1]
        if (next !== undefined) tl.to(w, { backgroundColor: 'rgba(0,0,0,0)', color: key ? accent : ink, duration: 0.12, ease: 'power1.in' }, next)
      } else if (style === 'editorial') {
        gsap.set(w, { autoAlpha: 0, yPercent: 50 })
        tl.to(w, { autoAlpha: 1, yPercent: 0, duration: 0.35, ease: 'power3.out' }, t)
      } else {
        gsap.set(w, { clipPath: 'inset(-20% 100% -20% 0%)' })
        tl.to(w, { clipPath: 'inset(-20% 0% -20% 0%)', duration: 0.25, ease: 'power2.out' }, t)
      }
    })
    if (!last) tl.to(node, { autoAlpha: 0, yPercent: -30, duration: 0.22, ease: 'power2.in' }, b - 0.22)
    a = b - 0.08
  })
  return tl
})
