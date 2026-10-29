import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { hash } from '../../../lengths/scenes/kit/fx/random.ts'
import { clamp01, ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { esc, isCjk, mixColor, pieces } from './lib/text.ts'

// Scramble reveal, with defineScene: a word is decoded. Two looks, by `style`:
//   scramble — every position cycles through characters and locks on its target from left to right; for
//              decoding, encryption, a model's output settling, a hash becoming a name;
//   flap     — a split-flap board: each cell walks forward through the alphabet to its target, each turn a flap
//              that folds down over a seam; cells land from left to right; for arrivals, results, a ranking.
// The scrambled characters are a hash of (position, frame), never Math.random, so any seek shows the same frame;
// Chinese targets cycle through common Chinese characters, others through letters and digits.
// State `decode` (1.6 s): scramble: 0–0.15 s the scrambled row appears; positions change 15 times a second (fast
// enough to read as noise, slow enough not to flicker) and lock 110 ms apart from 0.35 s; an unlocked position is
// muted, a locked one ink, and each lock flashes the accent for 0.25 s (a reaction on landing). flap: each cell
// turns 8 + 2i times, 70 ms a turn, so the cells land left to right; the folding half shows the next character.
// State `hold` (2 s): the word holds still.
// Adapted from HyperFrames scramble-reveal and split-flap-board.
const HAN = '的一是在不了有人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题'
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export default defineScene(({ root, at, color, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '注意力机制'
  const style = (parameters.style as string | undefined) === 'flap' ? 'flap' : 'scramble'
  const caption = (parameters.caption as string | undefined) ?? ''
  const chars = pieces(text, 'char').map(p => p.text)
  const pool = (ch: string) => (isCjk(ch) ? HAN : LATIN)
  frame(root, `
    .sc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3cqh; }
    .sc__row { display: flex; gap: ${style === 'flap' ? '0.8cqw' : '0'}; font: 600 ${style === 'flap' ? 9 : 10}cqw/1 ${style === 'flap' ? 'var(--pm-font-mono)' : 'var(--pm-font-sans)'}; }
    .sc__c { display: inline-block; width: 1em; text-align: center; white-space: pre; }
    .sc--flap .sc__c { position: relative; width: 1.25em; height: 1.45em; line-height: 1.45em; border-radius: 0.12em; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong); overflow: clip; }
    .sc--flap .sc__c::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 0.12cqw; background: var(--pm-color-line-strong); }
    .sc--flap .sc__gap { width: 0.5em; background: none; border: none; }
    .sc--flap .sc__gap::after { content: none; }
    .sc__face { display: inline-block; transform-origin: 50% 50%; }
  `, `<div class="sc sc--${style}"><div class="sc__row">${chars.map(c => `<span class="sc__c${c.trim() ? '' : ' sc__gap'}"><span class="sc__face"></span></span>`).join('')}</div>${caption ? `<div class="lf-caption">${esc(caption)}</div>` : ''}</div>`)

  const faces = [...root.querySelectorAll<HTMLElement>('.sc__face')]
  const row = root.querySelector<HTMLElement>('.sc__row')!
  const end = at(1) / 1000
  const ink = color('ink'), muted = color('muted'), accent = color('accent')
  const mix = (a: string, b: string, k: number) => mixColor(a, b, clamp01(k))

  return (ms: number) => {
    const t = ms / 1000
    // The row fades up over the first 0.15 s.
    const fade = ease.out2(clamp01(t / 0.15))
    row.style.opacity = fade.toFixed(3)
    row.style.visibility = fade > 0 ? '' : 'hidden'
    chars.forEach((target, i) => {
      const face = faces[i]!
      if (target.trim() === '') { face.textContent = target; return }
      const p = pool(target)
      if (style === 'scramble') {
        const lock = Math.min(end - 0.3, 0.35 + i * 0.11)
        if (t >= lock) {
          face.textContent = target
          face.style.color = mix(accent, ink, (t - lock) / 0.25)
        } else {
          const f = Math.floor(t * 15)
          face.textContent = p[Math.floor(hash(i, f, 7) * p.length)]!
          face.style.color = muted
        }
        face.style.transform = ''
      } else {
        const turns = 8 + 2 * i, each = Math.min(0.07, (end - 0.3) / (8 + 2 * chars.length)), start = 0.15
        const k = (t - start) / each   // the turn in progress, with its fraction
        const at0 = Math.floor(hash(i, 3) * p.length)
        if (k >= turns) {
          face.textContent = target
          face.style.transform = ''
          face.style.color = mix(accent, ink, (t - start - turns * each) / 0.25)
        } else {
          const n = Math.max(0, Math.floor(k)), frac = k <= 0 ? 0 : k - n
          const shown = n + (frac >= 0.5 ? 1 : 0)   // the next character shows once the flap has passed the seam
          face.textContent = shown >= turns ? target : p[(at0 + shown) % p.length]!
          // A flap folds down: the face squashes to the seam and opens again with the next character.
          face.style.transform = `scaleY(${Math.abs(Math.cos(Math.PI * frac)).toFixed(3)})`
          face.style.color = muted
        }
      }
    })
  }
})
