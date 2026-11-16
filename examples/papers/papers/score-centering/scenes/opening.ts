import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, frame } from '../../../kit/frame.ts'
import { MARK } from '../../../kit/brand.ts'
export default gsapScene(({root,gsap,at,durations})=>{
frame(root,`
 .mark{position:absolute;left:8cqw;top:20cqh;width:17cqw;height:17cqw;border-radius:3cqw;overflow:hidden}.mark svg{width:100%;height:100%}
 .series{position:absolute;left:30cqw;top:20cqh;font-size:2.6cqw;font-weight:700;color:var(--c-accent)}
 .name{position:absolute;left:30cqw;top:28cqh;font-size:5.6cqw;font-weight:850}
 .title{position:absolute;left:8cqw;top:51cqh;font-size:5cqw;font-weight:850}
 .sub{position:absolute;left:8cqw;top:63cqh;font-size:2.7cqw;font-weight:700}
 .meta{position:absolute;left:8cqw;top:72cqh;font-size:1.6cqw;color:var(--c-muted)}
`,`${brand('论文精读')}<div class="mark">${MARK}</div><div class="series">论文精读 · 原理、实现与实验</div><div class="name">翰林院传达室</div><div class="title">Score Centering</div><div class="sub">消除强化学习中反复累积的漂移</div><div class="meta">Martin Marek · Max Ryabinin　/　Together AI　/　arXiv 2609.20807v1</div>`)
const tl=gsap.timeline();tl.set({}, {}, (at(0)+durations[0])/1000);return tl
})