import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame, markSvg } from '../kit/frame.ts'

// A logo sting in three states, with Anime.js. `mark` (1.6 s): after a 0.2 s breath the page outline draws,
// the fold follows, and the play triangle pops in last: the mark is built in the order it is read. `name`
// (1.6 s): the mark slides left to make room while the letters of the name rise out of a mask one by one
// (40 ms apart), then the tagline fades up. `hold` (1.8 s): nothing new; the whole lockup drifts 1.5% larger so
// the frame stays alive while the name is remembered. The same scene opens the 30- and 60-second films.
export default animeScene(({ root, anime, at, parameters }) => {
  const name = (parameters.name as string | undefined) ?? 'Presmium'
  const tagline = (parameters.tagline as string | undefined) ?? '讲义、幻灯片、Notebook 与视频，来自同一份文稿'
  frame(root, `
    .ls { position: absolute; inset: 0; }
    .ls__mark { position: absolute; left: 44cqw; top: calc(50cqh - 6cqw); width: 12cqw; height: 12cqw; color: var(--pm-color-accent); overflow: visible; }
    .ls__mark .mark__play { transform-box: fill-box; transform-origin: center; }
    .ls__name { position: absolute; left: 39.5cqw; top: calc(50cqh - 5.6cqw); height: 9cqw; overflow: hidden; font: 600 8cqw/1.1 var(--pm-font-serif); letter-spacing: -0.01em; white-space: nowrap; }
    .ls__name span { display: inline-block; }
    .ls__tag { position: absolute; left: 0; right: 0; top: calc(50cqh + 6cqw); text-align: center; }
  `, `<div class="ls"><div class="ls__lockup">${markSvg('mark').replace('class="mark"', 'class="mark ls__mark"')}
    <div class="ls__name">${[...name].map(ch => `<span>${ch}</span>`).join('')}</div></div>
    <div class="lf-caption ls__tag">${tagline}</div></div>`)
  const tl = anime.createTimeline({ autoplay: false })
  // mark
  tl.add(anime.svg.createDrawable('.mark__page'), { draw: ['0 0', '0 1'], duration: 900, ease: 'inOutCubic' }, at(0) + 200)
  tl.add(anime.svg.createDrawable('.mark__fold'), { draw: ['0 0', '0 1'], duration: 300, ease: 'outCubic' }, at(0) + 950)
  tl.add('.mark__play', { scale: [0, 1], duration: 450, ease: 'outBack(2)' }, at(0) + 1100)
  // name: the mark moves 19 cqw left (158% of its 12 cqw width) as the letters rise.
  // The letters start once the mark has cleared their place (73% of its move, 92% of the way with this ease).
  tl.add('.ls__mark', { translateX: ['0%', '-158%'], duration: 550, ease: 'inOutCubic' }, at(1))
  tl.add('.ls__name span', { translateY: ['110%', '0%'], duration: 500, delay: anime.stagger(40), ease: 'outExpo' }, at(1) + 400)
  tl.add('.ls__tag', { opacity: [0, 1], translateY: ['40%', '0%'], duration: 450, ease: 'outExpo' }, at(1) + 1000)
  // hold
  tl.add('.ls', { scale: [1, 1.015], duration: at(3) - at(2), ease: 'linear' }, at(2))
  return tl
})
