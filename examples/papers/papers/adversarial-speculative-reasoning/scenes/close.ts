import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, frame, TYPE } from '../../../kit/frame.ts'
import { D, PAPER, PAPER_COLOURS, TERMS } from './paper.ts'

const trainMin = `${(D.training.fraction_range[0] * 100).toFixed(2)}%`
const trainMax = `${(D.training.fraction_range[1] * 100).toFixed(2)}%`
const speedCost = `${Math.round(D.speed.paper_approximation * 100)}%`
const modelScale = Math.round((D.training.glm.target_b + D.training.deepseek.target_b) / 20) * 10

// The close lands the mechanism, then closes on the cost and evidence. The verification block
// carries across both states so the final claim is read off the same object the talk introduced.
export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)
  const last = D.precision.slots.length - 1
  const slots = D.precision.slots.map(slot => `<i class="pslot pslot${slot}" style="--shade:${(slot / last).toFixed(3)}">
    <span class="pslot__n">${slot}</span>
    <span class="pslot__k">关键决策</span>
  </i>`).join('')

  frame(root, `${PAPER_COLOURS}
    .top0 { position: absolute; left: 8cqw; top: 10cqh; width: 84cqw; }
    .kicker { font-size: ${TYPE.small}cqw; font-weight: 750; color: var(--pm-color-muted); letter-spacing: 0; }
    .claim { margin-top: 1cqh; font-size: ${TYPE.lead}cqw; line-height: 1.2; white-space: nowrap; }
    .claim b { font-size: ${TYPE.title}cqw; font-weight: 850; color: var(--c-precise); }
    .models { position: absolute; left: 8cqw; top: 22cqh; width: 84cqw; display: grid; grid-template-columns: 34cqw 16cqw 34cqw; align-items: center; }
    .node { padding: 1.5cqw 0 1.4cqw; border-top: 0.16cqw solid var(--c-line-strong); border-bottom: 0.16cqw solid var(--c-line-strong); }
    .node__role { display: block; font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .node strong { display: block; margin-top: 0.4cqh; font-size: ${TYPE.title}cqw; line-height: 1.05; }
    .node small { display: block; margin-top: 0.55cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .target strong { color: var(--c-target); }
    .draft strong { color: var(--c-draft); }
    .draft strong em { font-style: normal; font-size: ${TYPE.lead}cqw; }
    .bridge { text-align: center; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .bridge b { display: block; font-size: 4.4cqw; line-height: 0.9; color: var(--c-accept); }
    .bridge small { display: block; margin-top: 0.6cqh; font-size: ${TYPE.tiny}cqw; }
    .precision { position: absolute; left: 8cqw; top: 43cqh; width: 84cqw; }
    .precision__h { display: flex; justify-content: space-between; align-items: baseline; gap: 2cqw; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .precision__h b { color: var(--pm-color-ink); font-size: ${TYPE.lead}cqw; white-space: nowrap; }
    .precision__h span { white-space: nowrap; }
    .strip { display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.55cqw; margin-top: 1.2cqh; }
    .pslot { position: relative; height: 7cqh; display: grid; place-items: center; border-radius: 0.7cqw; color: var(--pm-color-on-accent); font-style: normal;
      font-family: var(--pm-font-mono); font-weight: 700; background: color-mix(in srgb, var(--c-noisy) calc(var(--shade) * 60%), var(--c-precise)); }
    .pslot__n { font-size: ${TYPE.label}cqw; line-height: 1; }
    .pslot__k { display: none; font-family: var(--pm-font-sans); font-size: ${TYPE.tiny}cqw; white-space: nowrap; }
    .pslot0 { display: flex; flex-direction: column; justify-content: center; gap: 0.3cqh; }
    .pslot0 .pslot__k { display: block; }
    .pslot0 { box-shadow: 0 0 0 0.34cqw var(--c-precise), 0 0 2.4cqh color-mix(in srgb, var(--c-precise) 22%, transparent); }
    .axis { display: flex; justify-content: space-between; margin-top: 0.65cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .top1 { position: absolute; left: 8cqw; top: 9cqh; width: 53cqw; }
    .top1 h2 { margin: 0.5cqh 0 0; font-size: ${TYPE.title}cqw; line-height: 1.08; white-space: nowrap; }
    .top1 p { margin: 0.6cqh 0 0; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .cost { position: absolute; right: 8cqw; top: 9cqh; width: 25cqw; padding-left: 2cqw; border-left: 0.18cqw solid var(--c-accept); }
    .cost span { display: block; font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .cost b { display: block; font-size: 5.2cqw; line-height: 1; color: var(--c-accept); white-space: nowrap; }
    .cost small { display: block; margin-top: 0.6cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .evidence { position: absolute; left: 8cqw; top: 57cqh; width: 84cqw; display: grid; grid-template-columns: 1fr 1fr; gap: 1.3cqw; }
    .fact { padding: 1.1cqw 1.3cqw; border-radius: 0.7cqw; background: var(--pm-color-sunk); }
    .fact span { display: block; font-size: ${TYPE.tiny}cqw; font-weight: 750; color: var(--pm-color-muted); }
    .fact b { display: block; margin-top: 0.35cqh; font-size: ${TYPE.label}cqw; line-height: 1.2; white-space: nowrap; }
    .takeaway { position: absolute; left: 8cqw; top: 70cqh; width: 84cqw; }
    .takeaway__lead { font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .takeaway__key { margin-top: 0.35cqh; font-size: 4.4cqw; font-weight: 850; line-height: 1.08; white-space: nowrap; }
    .takeaway__key em { font-style: normal; color: var(--c-precise); }
  `, `
    ${brand(PAPER.short)}
    <div class="top0">
      <div class="kicker">同一套模型与验证</div>
      <div class="claim">不是换模型，<b>是重分配 context precision</b></div>
    </div>
    <div class="models">
      <div class="node target">
        <span class="node__role">target model</span>
        <strong>冻结</strong>
        <small>权重与验证规则</small>
      </div>
      <div class="bridge"><span>${TERMS.exactVerification}</span><b>=</b><span>不变</span><small>同一 KV context</small></div>
      <div class="node draft">
        <span class="node__role">draft model · 只训练这里</span>
        <strong><em>${trainMin}–${trainMax}</em></strong>
        <small>整套系统可训练参数</small>
      </div>
    </div>
    <div class="precision">
      <div class="precision__h"><b>关键决策首 token 写入 slot 0</b><span>${TERMS.verificationBlock} · 8 slots</span></div>
      <div class="strip">${slots}</div>
      <div class="axis"><span>slot 0 · 最精确</span><span>slot 7 · 最粗糙</span></div>
    </div>
    <div class="top1">
      <div class="kicker">结论</div>
      <h2>结论仍然成立</h2>
      <p>关键决策句首 token 仍在 slot 0</p>
    </div>
    <div class="cost">
      <span>${TERMS.acceptedLength} 代价</span>
      <b>≤ ${speedCost}</b>
      <small>论文概括</small>
    </div>
    <div class="evidence">
      <div class="fact"><span>证据</span><b>2 × 约 ${modelScale}B 模型</b></div>
      <div class="fact"><span>任务</span><b>长程编程</b></div>
    </div>
    <div class="takeaway">
      <div class="takeaway__lead">speculative decoding</div>
      <div class="takeaway__key">也是<em>context precision 的分配器</em></div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.top0', '.models', '.precision', '.top1', '.cost', '.evidence', '.takeaway'], { autoAlpha: 0 })
  gsap.set('.pslot', { autoAlpha: 0 })

  // State 0: the unchanged target, the small trained draft, then the decision moved to slot 0.
  tl.fromTo('.top0', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(0, 0.02))
  tl.fromTo('.models', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(0, 0.16))
  tl.fromTo('.precision', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(0, 0.42))
  tl.fromTo('.pslot', { autoAlpha: 0, scale: 0.86, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.28, ease: 'expo.out', stagger: 0.035, immediateRender: false }, T(0, 0.5))
  tl.fromTo('.takeaway', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(0, 0.76))

  // State 1: the same verification block answers the cost and scope question; then the thesis returns.
  tl.to('.models', { autoAlpha: 0, y: -8, duration: 0.28, ease: 'power2.in' }, T(1, 0.02))
  tl.to('.top0', { autoAlpha: 0, duration: 0.25 }, T(1, 0.08))
  tl.to('.precision', { top: '32cqh', duration: 0.5, ease: 'power3.inOut' }, T(1, 0.1))
  tl.fromTo('.top1', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'expo.out', immediateRender: false }, T(1, 0.16))
  tl.fromTo('.cost', { autoAlpha: 0, x: 12 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(1, 0.3))
  tl.fromTo('.evidence', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'expo.out', immediateRender: false }, T(1, 0.48))
  tl.fromTo('.fact', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out', stagger: 0.1, immediateRender: false }, T(1, 0.52))
  tl.to('.takeaway', { top: '70cqh', duration: 0.4, ease: 'power2.inOut' }, T(1, 0.74))
  tl.set({}, {}, T(2))
  return tl
})
