import { gsapScene } from '@lincyaw/addon-motion/scene'

// 3D transforms: flash cards flip on rotationY (front and back faces with backface-visibility), then the three
// cards stack into layers in depth (rotationX on the deck, z on each card). The parent sets `perspective`;
// every level between it and the faces keeps `transform-style: preserve-3d`.
const CARDS = [['Q', '查询：我在找什么'], ['K', '键：我有什么'], ['V', '值：我给出什么']]

export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = `
    <style>
      .f3 { position: absolute; inset: 0; perspective: 60rem; display: grid; place-items: center; }
      .f3__deck { position: relative; width: 84%; height: 60%; display: flex; gap: 3%; transform-style: preserve-3d; }
      .f3__card { position: relative; width: 31%; height: 100%; transform-style: preserve-3d; }
      .f3__face { position: absolute; inset: 0; display: grid; place-items: center; padding: 1rem; border-radius: 0.9rem; backface-visibility: hidden; text-align: center; box-sizing: border-box; border: 3px solid var(--pm-color-accent); }
      .f3__front { background: var(--pm-color-surface); color: var(--pm-color-accent); font: 700 4rem var(--pm-font-serif); }
      .f3__back { background: var(--pm-color-accent); color: var(--pm-color-on-accent); font: 600 1.25rem/1.5 var(--pm-font-sans); transform: rotateY(180deg); }
    </style>
    <div class="f3"><div class="f3__deck">
      ${CARDS.map(([a, b]) => `<div class="f3__card"><div class="f3__face f3__front">${a}</div><div class="f3__face f3__back">${b}</div></div>`).join('')}
    </div></div>`
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  // Step 0: the cards fall forward into place.
  tl.from('.f3__card', { rotationX: -90, transformOrigin: '50% 0%', opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12 }, s(0))
  // Step 1: each card turns over.
  tl.to('.f3__card', { rotationY: 180, duration: 0.8, ease: 'power2.inOut', stagger: 0.15 }, s(1))
  // Step 2: the cards slide to the middle and spread in depth; the deck tilts to show the layers.
  // A card's step is its width plus the gap: 34.1% of the deck, 110% of the card.
  tl.to('.f3__card', { xPercent: i => (1 - i) * 110, z: i => (1 - i) * 90, duration: 1, ease: 'power2.inOut' }, s(2))
  tl.to('.f3__deck', { rotationX: 58, rotationZ: -28, scale: 0.8, duration: 1, ease: 'power2.inOut' }, s(2))
  return tl
})
