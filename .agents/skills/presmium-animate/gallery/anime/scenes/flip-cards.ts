import { animeScene } from '@lincyaw/addon-motion/scene'

// 3D transforms: flash cards flip with rotateY. The perspective is CSS on the parent (tweening `perspective` without a
// from-value would start it at 0px); each card keeps preserve-3d and each face hides its back.
const CARDS: Array<[string, string]> = [['梯度', '函数增长最快的方向'], ['学习率', '每一步走多远'], ['过拟合', '记住了训练集，没学会规律']]

export default animeScene(({ root, anime, at, color }) => {
  const face = `position: absolute; inset: 0; display: grid; place-items: center; padding: 8%; text-align: center; border-radius: 4cqw;
                backface-visibility: hidden; -webkit-backface-visibility: hidden; box-sizing: border-box;`
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size; display: flex; align-items: center; justify-content: center; gap: 4%;
                perspective: 120cqw; font-family: var(--pm-font-sans)">
      ${CARDS.map(([q, a]) => `
        <div class="card" style="position: relative; width: 26%; aspect-ratio: 3 / 4; transform-style: preserve-3d">
          <div style="${face} background: ${color('surface')}; border: 0.4cqw solid ${color('line-strong')}; color: ${color('ink')}; font-size: 4.4cqw; font-weight: 600">${q}</div>
          <div style="${face} background: ${color('accent')}; color: ${color('on-accent')}; font-size: 2.8cqw; transform: rotateY(180deg)">${a}</div>
        </div>`).join('')}
    </div>`
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the cards deal in, tilted.
  tl.add('.card', { opacity: [0, 1], translateY: ['30%', '0%'], rotateX: [40, 0], duration: 600, ease: 'outCubic', delay: anime.stagger(150) }, at(0))
  // Step 1: they turn over one by one.
  tl.add('.card', { rotateY: [0, 180], duration: 900, ease: 'inOutBack', delay: anime.stagger(250) }, at(1))
  return tl
})
