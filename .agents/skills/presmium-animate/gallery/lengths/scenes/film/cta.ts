import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms } from '../kit/atoms.ts'
import { frame, markSvg } from '../kit/frame.ts'

// The call to action that ends the product films, built from three atoms. `mark`: the mark pops and the name is
// wiped in beside it. `type`: a terminal rises under them and the command is typed. `hold`: the address fades in
// and nothing else moves: the last frame is the one people pause on, so it stays still and holds only what they
// need to act (one command, one address).
export default gsapScene(({ root, gsap, at, parameters }) => {
  const name = (parameters.name as string | undefined) ?? 'Presmium'
  const command = (parameters.command as string | undefined) ?? 'pnpm studio'
  const address = (parameters.address as string | undefined) ?? 'github.com/Lincyaw/presmium'
  frame(root, `
    .ca { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5cqh; }
    .ca__lockup { display: flex; align-items: center; gap: 2cqw; }
    .ca__mark { width: 8cqw; height: 8cqw; color: var(--pm-color-accent); }
    .ca__term { padding: 2.2cqw 3cqw; border-radius: 1.2cqw; background: var(--pm-color-code); border: 0.18cqw solid var(--pm-color-line-strong); font: 500 3.4cqw/1 var(--pm-font-mono); white-space: pre; display: flex; align-items: center; min-width: 36cqw; }
    .ca__prompt { color: var(--pm-color-accent); }
    .ca__caret { display: inline-block; width: 0.55em; height: 1.1em; margin-left: 0.08em; background: currentColor; }
  `, `<div class="ca">
    <div class="ca__lockup">${markSvg('mark').replace('class="mark"', 'class="mark ca__mark"')}<div class="lf-title ca__name">${name}</div></div>
    <div class="ca__term"><span class="ca__prompt">$ </span><span class="ca__text"></span><span class="ca__caret"></span></div>
    <div class="lf-caption ca__address">${address}</div>
  </div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  a.enter('.ca__mark', s(0), { from: 'scale' })
  a.reveal('.ca__name', s(0) + 0.25)
  a.enter('.ca__term', s(1))
  a.type('.ca__text', command, s(1) + 0.4)
  a.enter('.ca__address', s(2), { from: 'fade' })
  return tl
})
