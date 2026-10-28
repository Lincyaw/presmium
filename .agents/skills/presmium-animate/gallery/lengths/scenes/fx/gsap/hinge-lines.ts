import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../kit/frame.ts'

// Hinge lines, with GSAP SplitText: each line of a title swings up from behind its own baseline like a page hinged
// at its bottom edge, and sharpens as it comes. State `reveal` (1 s). 0–0.74 s: the title, then the subtitle 90 ms
// later, turn up from −95° (lying towards the viewer, under the line) to upright, rising 40% as they turn, from a
// blur to sharp (power3.out: expo.out lands in three frames and the turn is never seen); each line sits in its own
// clipping box, so the turn has depth but never leaves its line. 0.45–0.85 s: the last word of the title takes the
// accent, led by a lighter glint, sweeping from left to right through the letters (a gradient clipped to the
// text), once the line has landed; the glint keeps the sweep visible where accent and ink are both dark.
// 0.85–1 s: rest, the filters removed.
// The split happens once at build (`autoSplit` off), into lines in a frame sized in container units; CJK lines
// are split as whole lines. The first 100 ms show little, so this is for titles, not text read at once.
export default gsapScene(({ root, gsap, plugins, parameters }) => {
  const title = (parameters.title as string | undefined) ?? 'Presmium'
  const sub = (parameters.sub as string | undefined) ?? '一份文稿，四种形态'
  frame(root, `
    .hl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.6cqh; text-align: center; }
    .hl__title { font: 600 ${TYPE.hero}cqw/1.2 var(--pm-font-serif); letter-spacing: -0.01em; white-space: nowrap; }
    .hl__sub { font-size: ${TYPE.body}cqw; line-height: 1.4; color: var(--pm-color-muted); white-space: nowrap; }
    .hl__mask { perspective: 80cqw; margin-inline: -0.4em; padding-inline: 0.4em; }
    .hl__key { background-image: linear-gradient(90deg, var(--pm-color-accent) 0 38%, color-mix(in oklab, var(--pm-color-accent) 45%, var(--pm-color-sheen)) 46%, var(--pm-color-ink) 56% 100%);
      background-size: 250% 100%; background-position: 100% 0%; -webkit-background-clip: text; background-clip: text; color: transparent; }
  `, `<div class="hl"><div class="hl__title">${title}</div><div class="hl__sub">${sub}</div></div>`)
  const { SplitText } = plugins
  const head = SplitText.create(root.querySelector('.hl__title'), { type: 'lines,words', mask: 'lines' })
  const tail = SplitText.create(root.querySelector('.hl__sub'), { type: 'lines', mask: 'lines' })
  const lines = [...head.lines, ...tail.lines]
  for (const mask of [...head.masks, ...tail.masks]) mask.classList.add('hl__mask')
  const key = head.words.at(-1)
  key?.classList.add('hl__key')

  const tl = gsap.timeline()
  gsap.set(lines, { rotationX: -95, yPercent: 40, transformOrigin: '50% 100%', filter: 'blur(0.6cqw)' })
  tl.to(lines, { rotationX: 0, yPercent: 0, filter: 'blur(0cqw)', duration: 0.65, ease: 'power3.out', stagger: 0.09 }, 0)
  tl.set(lines, { filter: 'none' }, 0.85)
  if (key) tl.to(key, { backgroundPosition: '0% 0%', duration: 0.4, ease: 'power1.inOut' }, 0.45)
  return tl
})
