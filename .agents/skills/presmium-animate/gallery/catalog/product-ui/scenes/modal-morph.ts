import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, esc, frame, list, num, pick, POINTER, POINTER_CSS, screen, SCREEN_CSS, shadow, str, type Variant } from './lib/ui.ts'

// Card to detail: a grid of cards, the pointer opens one, and that same card grows into the detail panel (a
// shared element: the card is not replaced by a panel, it becomes it). States `grid`, `open`, `detail`. `grid`
// (1.2 s): the cards rise 70 ms apart, the pointer arrives on the chosen one as the state ends. `open` (0.9 s):
// 0–0.12 s the press; 0.12–0.72 s the card moves and grows into the panel with both ends eased, its picture and
// title growing with it (the card is a size container, so its contents scale as one), the other cards recede
// and dim, the pointer steps aside. `detail` (1.8 s): the panel's details rise only once it has landed (the
// cause before the effect), one line, then the button; hold. A card's picture is the author's image or a drawn
// page. Adapted from HyperFrames modal-morph (with sheet-spring-up's idea of one surface that grows).
interface Card { title: string, image?: string, variant?: Variant }
const GRID = [8.5, 37, 65.5]   // left of each card, % of the frame

export default gsapScene(({ root, gsap, at, parameters }) => {
  const cards = list<Card>(parameters, 'cards', [
    { title: '第 1 讲 · 线性回归', variant: 'doc' },
    { title: '第 2 讲 · 梯度下降', variant: 'chart' },
    { title: '第 3 讲 · 过拟合', variant: 'slides' },
  ]).slice(0, 3)
  const open = Math.max(0, Math.min(cards.length - 1, num(parameters, 'open', 1)))
  const detail = str(parameters, 'detail', '12 页 · 4 个动画 · 18 分钟讲授视频')
  const button = str(parameters, 'button', '打开讲义')
  const f = frame(root, `
    ${POINTER_CSS}
    ${SCREEN_CSS}
    .mm { position: absolute; top: 24%; width: 26%; height: 52%; container-type: size; border-radius: 1.4cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.2)}; overflow: hidden; }
    .mm__pic { position: absolute; left: 0; right: 0; top: 0; height: 64%; border-bottom: 0.4cqw solid var(--pm-color-line); }
    .mm__title { position: absolute; left: 6cqw; right: 6cqw; top: 70%; font-size: 7cqw; font-weight: 600; white-space: nowrap; }
    .mm__more { position: absolute; left: 6cqw; right: 6cqw; top: 82%; display: flex; align-items: center; justify-content: space-between; }
    .mm__detail { font-size: 3.4cqw; color: var(--pm-color-muted); }
    .mm__btn { padding: 1.6cqh 3cqw; border-radius: 1.4cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-size: 3cqw; font-weight: 600; }
  `, `
    ${cards.map((c, i) => `<div class="mm" data-i="${i}" style="left:${GRID[i]}%"><div class="mm__pic ui-screen">${screen(c.image, c.variant ?? 'doc')}</div><div class="mm__title">${esc(c.title)}</div>
      ${i === open ? `<div class="mm__more"><span class="mm__detail">${esc(detail)}</span><span class="mm__btn">${esc(button)}</span></div>` : ''}</div>`).join('')}
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const all = [...f.querySelectorAll<HTMLElement>('.mm')]
  const card = all[open]!, others = all.filter(c => c !== card), layer = pick(f, '.lf-pointer-layer')
  // grid
  a.enter(all, 0, { stagger: 0.07 })
  gsap.set(layer, { xPercent: 90, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.35)
  a.point(layer, Math.max(0.45, s(1) - 0.7), GRID[open]! + 13, 24 + 52 * 0.4)
  // open: press, then the card becomes the panel
  const t = s(1)
  a.click('.lf-pointer', '.lf-pointer__ring', card, t)
  tl.set(card, { zIndex: 2 }, t)
  tl.to(card, { left: '18%', top: '6%', width: '64%', height: '88%', duration: 0.6, ease: 'power3.inOut' }, t + 0.12)
  tl.to(others, { opacity: 0.25, scale: 0.96, duration: 0.45, ease: 'power2.out' }, t + 0.12)
  a.point(layer, t + 0.15, 88, 92)
  tl.to(layer, { autoAlpha: 0, duration: 0.2 }, t + 0.6)
  // detail: the line, then the button, once the panel has landed
  gsap.set('.mm__more > *', { autoAlpha: 0, yPercent: 40 })
  tl.to('.mm__detail', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, s(2) + 0.05)
  tl.to('.mm__btn', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, s(2) + 0.25)
  return tl
})
