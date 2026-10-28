import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms } from '../kit/atoms.ts'
import { frame } from '../kit/frame.ts'

// Type: a command typed at 14 characters a second (a fast but human rate) with a caret, the moment before a call
// to action. 0–0.1 s: the prompt; 0.1–0.9 s: the 11 characters; 0.9–1 s: rest with the caret on. The caret stays
// lit while typing, as a terminal's does.
export default gsapScene(({ root, gsap, parameters }) => {
  const command = (parameters.command as string | undefined) ?? 'pnpm studio'
  frame(root, `
    .ty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .ty__term { padding: 3cqw 4cqw; border-radius: 1.2cqw; background: var(--pm-color-code); border: 0.18cqw solid var(--pm-color-line-strong); color: var(--pm-color-ink); font: 500 4.4cqw/1 var(--pm-font-mono); white-space: pre; display: flex; align-items: center; min-width: 46cqw; }
    .ty__prompt { color: var(--pm-color-accent); }
    .ty__caret { display: inline-block; width: 0.55em; height: 1.1em; margin-left: 0.08em; background: currentColor; }
  `, `<div class="ty"><div class="ty__term"><span class="ty__prompt">$ </span><span class="ty__text"></span><span class="ty__caret"></span></div></div>`)
  const tl = gsap.timeline()
  atoms(gsap, tl).type('.ty__text', command, 0.1)
  return tl
})
