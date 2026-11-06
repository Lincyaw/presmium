import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { D, PAPER, PAPER_COLOURS, TERMS } from './paper.ts'

const GLM_TRAINABLE = `${D.training.glm.trainable_b.toFixed(2)}B`
const DEEPSEEK_TRAINABLE = `${(D.training.deepseek.trainable_b * 1000).toFixed(0)}M`
const DEEPSEEK_SHARE = `${(D.training.fraction_range[0] * 100).toFixed(2)}%`
const GLM_SHARE = `${(D.training.fraction_range[1] * 100).toFixed(2)}%`
const GLM_SYSTEM = `${(D.training.glm.target_b + D.training.glm.draft_b).toFixed(1)}B`
const DEEPSEEK_SYSTEM = `${(D.training.deepseek.target_b + D.training.deepseek.draft_b).toFixed(1)}B`

const TARGET_CELLS = Array.from({ length: 18 }, () => '<i></i>').join('')
const DRAFT_CELLS = Array.from({ length: 12 }, (_, index) =>
  `<i class="${index === 4 || index === 5 ? 'active' : ''}"></i>`,
).join('')

// Three moves: locate the committing sentence, fork one shared prefix into two behaviours,
// then train the draft in reverse while the target stays frozen.
export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)

  frame(root, `${PAPER_COLOURS}
    .trajectory { position: absolute; left: 8cqw; top: 16cqh; width: 84cqw; }
    .trace-head { display: flex; align-items: baseline; justify-content: space-between; gap: 2cqw; }
    .trace-head b, .stage-head b { font-size: ${TYPE.lead}cqw; }
    .trace-head span, .stage-head span { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .reviewer { position: absolute; right: 7cqw; top: 8.5cqh; display: flex; align-items: center; gap: 0.8cqw;
      padding: 0.65cqw 1.1cqw; border-radius: 99cqw; background: var(--c-target-soft);
      box-shadow: inset 0 0 0 0.16cqw var(--c-target); font-size: ${TYPE.small}cqw; white-space: nowrap; }
    .reviewer i { width: 1cqw; height: 1cqw; border-radius: 50%; background: var(--c-target); }
    .reviewer b { color: var(--c-target); }
    .trace-lines { display: grid; gap: 1.05cqh; margin-top: 2.2cqh; }
    .trace-line { position: relative; min-height: 6.2cqh; padding: 1.15cqw 1.5cqw; border-radius: 0.75cqw;
      background: var(--pm-color-surface); box-shadow: inset 0 0 0 0.11cqw var(--pm-color-line);
      display: grid; grid-template-columns: 3cqw 1fr; align-items: center; gap: 1cqw;
      font-family: var(--pm-font-mono); font-size: ${TYPE.label}cqw; color: var(--pm-color-muted); }
    .trace-line i { font-family: var(--pm-font-sans); font-size: ${TYPE.tiny}cqw; font-style: normal; color: var(--pm-color-muted); }
    .trace-line.decision { isolation: isolate; color: var(--pm-color-ink); box-shadow: inset 0 0 0 0.22cqw var(--c-draft); }
    .decision-fill { position: absolute; inset: 0; z-index: -1; border-radius: inherit;
      background: var(--c-draft-soft); transform: scaleX(0); transform-origin: 0 50%; }
    .decision-tag { position: absolute; right: 1.2cqw; top: 0.9cqh; padding: 0.25cqw 0.65cqw; border-radius: 99cqw;
      background: var(--c-draft); color: var(--pm-color-on-accent); font-family: var(--pm-font-sans);
      font-size: ${TYPE.tiny}cqw; font-weight: 750; white-space: nowrap; }
    .fork-stage { position: absolute; left: 8cqw; top: 15cqh; width: 84cqw; }
    .stage-head { display: flex; align-items: baseline; justify-content: space-between; gap: 2cqw; }
    .stage-head b { color: var(--pm-color-ink); }
    .prefix { position: relative; margin-top: 2cqh; padding: 1.65cqw 1.8cqw; border-radius: 0.9cqw;
      background: var(--pm-color-surface); box-shadow: inset 0 0 0 0.14cqw var(--pm-color-line-strong);
      font-family: var(--pm-font-mono); font-size: ${TYPE.label}cqw; color: var(--pm-color-ink); }
    .prefix span { display: block; margin-bottom: 0.55cqh; font-family: var(--pm-font-sans); font-size: ${TYPE.tiny}cqw;
      font-weight: 750; color: var(--c-draft); }
    .prefix em { font-style: normal; color: var(--pm-color-muted); }
    .branch-origin { position: absolute; left: 41.2cqw; top: 37.8cqh; width: 2.4cqw; height: 2.4cqw; border-radius: 50%;
      background: var(--pm-color-surface); box-shadow: inset 0 0 0 0.28cqw var(--c-draft); }
    .re-sample { position: absolute; left: 43.4cqw; top: 36.7cqh; padding: 0.45cqw 0.8cqw; border-radius: 99cqw;
      background: var(--pm-color-surface); font-size: ${TYPE.tiny}cqw; font-weight: 700; color: var(--pm-color-muted); white-space: nowrap; }
    .fork-line { fill: none; stroke: var(--c-draft); stroke-width: 0.42; stroke-dasharray: 1 2; stroke-dashoffset: 1; }
    .branch { position: absolute; top: 54cqh; width: 38cqw; min-height: 14cqh; padding: 1.4cqw 1.5cqw 1.25cqw;
      border-radius: 0.85cqw; background: var(--pm-color-surface); }
    .branch.pref { left: 8cqw; box-shadow: inset 0 0 0 0.18cqw var(--c-accept); }
    .branch.fail { right: 8cqw; box-shadow: inset 0 0 0 0.18cqw var(--c-reject); }
    .branch .k { font-size: ${TYPE.tiny}cqw; font-weight: 750; }
    .branch.pref .k { color: var(--c-accept); } .branch.fail .k { color: var(--c-reject); }
    .branch b { display: block; margin-top: 0.55cqh; font-size: ${TYPE.lead}cqw; line-height: 1.16; }
    .branch span { display: block; margin-top: 0.55cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .pair-label { position: absolute; left: 50%; top: 72.2cqh; transform: translateX(-50%); padding: 0.45cqw 1cqw;
      border-radius: 99cqw; background: var(--pm-color-surface); font-size: ${TYPE.small}cqw; font-weight: 700; white-space: nowrap; }

    .training-head { position: absolute; left: 8cqw; top: 10.5cqh; font-size: ${TYPE.lead}cqw; font-weight: 750; }
    .training-head span { margin-left: 1cqw; font-size: ${TYPE.small}cqw; font-weight: 500; color: var(--pm-color-muted); }
    .target-lane, .train-lane { position: absolute; left: 8cqw; width: 84cqw; border-radius: 0.9cqw;
      background: var(--pm-color-surface); }
    .target-lane { top: 19cqh; min-height: 13cqh; display: grid; grid-template-columns: 21cqw 1fr 13cqw;
      align-items: center; gap: 1.4cqw; padding: 1.2cqw 1.5cqw; box-shadow: inset 0 0 0 0.15cqw var(--c-target); }
    .lane-name span { display: block; font-size: ${TYPE.tiny}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .lane-name b { display: block; margin-top: 0.25cqh; font-size: ${TYPE.body}cqw; color: var(--c-target); }
    .target-rail { display: grid; grid-template-columns: repeat(18, 1fr); gap: 0.35cqw; height: 4.6cqh; align-items: stretch; }
    .target-rail i { border-radius: 0.2cqw; background: var(--c-target-soft); box-shadow: inset 0 0 0 0.08cqw var(--c-target); }
    .freeze { padding-left: 1.2cqw; border-left: 0.14cqw solid var(--pm-color-line-strong); text-align: right; }
    .freeze b { display: block; font-size: ${TYPE.body}cqw; color: var(--c-target); }
    .freeze span { font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .train-lane { top: 38cqh; min-height: 25cqh; display: grid; grid-template-columns: 21cqw 2.4cqw 12.5cqw 2.4cqw 1fr;
      align-items: center; gap: 1cqw; padding: 1.2cqw 1.5cqw; box-shadow: inset 0 0 0 0.15cqw var(--c-draft); }
    .pair-mini { display: grid; gap: 0.9cqh; }
    .pair-mini div { padding: 0.7cqw 0.8cqw; border-radius: 0.55cqw; background: var(--pm-color-sunk); }
    .pair-mini .chosen { border-left: 0.28cqw solid var(--c-reject); }
    .pair-mini .rejected { border-left: 0.28cqw solid var(--c-accept); }
    .pair-mini em { display: block; font-family: var(--pm-font-mono); font-size: ${TYPE.tiny}cqw; font-style: normal; color: var(--pm-color-muted); }
    .pair-mini b { font-size: ${TYPE.small}cqw; }
    .flow { font-size: ${TYPE.lead}cqw; color: var(--c-draft); text-align: center; }
    .dpo { width: 12.5cqw; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; text-align: center;
      box-shadow: inset 0 0 0 0.3cqw var(--c-draft); background: var(--c-draft-soft);
      font-size: ${TYPE.tiny}cqw; font-weight: 750; line-height: 1.2; color: var(--c-draft); }
    .dpo b { display: block; font-size: ${TYPE.body}cqw; }
    .draft { min-width: 0; }
    .draft-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.8cqw; }
    .draft-head span { font-size: ${TYPE.body}cqw; font-weight: 750; color: var(--c-draft); }
    .draft-head em { font-size: ${TYPE.tiny}cqw; font-style: normal; color: var(--pm-color-muted); white-space: nowrap; }
    .draft-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0.42cqw; margin-top: 1.3cqh; }
    .draft-grid i { height: 5.2cqh; border-radius: 0.25cqw; background: var(--c-draft-soft);
      box-shadow: inset 0 0 0 0.1cqw var(--c-draft); }
    .draft-grid i.active { background: var(--c-draft); }
    .trainable-note { margin-top: 1.1cqh; text-align: right; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .trainable-note b { color: var(--pm-color-ink); }
    .readout { position: absolute; left: 8cqw; top: 68cqh; width: 84cqw; display: flex; align-items: baseline;
      justify-content: flex-end; gap: 1cqw; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .readout b { font-size: ${TYPE.lead}cqw; color: var(--c-draft); font-variant-numeric: tabular-nums; }
    .readout span { white-space: nowrap; }
  `, `
    ${brand(PAPER.short)}
    <div class="reviewer reviewer-a"><i></i><span>${TERMS.targetModel}</span><b>担任 judge</b></div>
    <div class="trajectory">
      <div class="trace-head"><b>智能体推理轨迹</b><span>逐句复查上下文</span></div>
      <div class="trace-lines">
        <div class="trace-line trace0"><i>01</i><span>Both implementations could work.</span></div>
        <div class="trace-line trace1"><i>02</i><span>The visible test only checks the basic path.</span></div>
        <div class="trace-line trace2 decision"><b class="decision-fill"></b><i>03</i><span>I will run the edge-case test before choosing.</span><b class="decision-tag">${TERMS.committingSentence}</b></div>
        <div class="trace-line trace3"><i>04</i><span>Then I can update the implementation.</span></div>
      </div>
    </div>
    <div class="reviewer reviewer-b"><i></i><span>${TERMS.targetModel}</span><b>重新采样</b></div>
    <div class="fork-stage">
      <div class="stage-head"><b>同一前缀 · 两种续写</b><span>每条续写只改变决策之后的行为</span></div>
      <div class="prefix"><span>共享前缀</span>Both implementations could work. The visible test only checks <em>…</em></div>
    </div>
    <div class="branch-origin"></div>
    <div class="re-sample">从同一点分叉</div>
    <svg class="layer" ${LAYER}>
      <path class="fork-line fork-left" pathLength="1" d="M 67.8 35 C 67.8 43 50 42 43.2 48.5"/>
      <path class="fork-line fork-right" pathLength="1" d="M 67.8 35 C 67.8 43 105 42 116.8 48.5"/>
    </svg>
    <div class="branch pref"><div class="k">preferred side（可取侧）</div><b>先运行边界测试</b><span>用实际结果决定实现</span></div>
    <div class="branch fail"><div class="k">adversarial side（对抗侧）</div><b>直接提交猜测</b><span>跳过验证继续修改</span></div>
    <div class="pair-label">${TERMS.forkPair} · ${TERMS.preferencePair}</div>

    <div class="training-head">只训练 ${TERMS.draftModel}<span>用反向偏好触发关键拒绝</span></div>
    <div class="target-lane">
      <div class="lane-name"><span>${TERMS.outputDistribution} 保持不变</span><b>${TERMS.targetModel}</b></div>
      <div class="target-rail">${TARGET_CELLS}</div>
      <div class="freeze"><b>冻结</b><span>不接收更新</span></div>
    </div>
    <div class="train-lane">
      <div class="pair-mini">
        <div class="chosen"><em>chosen</em><b>adversarial side</b></div>
        <div class="rejected"><em>rejected</em><b>preferred side</b></div>
      </div>
      <div class="flow">→</div>
      <div class="dpo"><span><b>反向</b>DPO</span></div>
      <div class="flow">→</div>
      <div class="draft">
        <div class="draft-head"><span>${TERMS.draftModel}</span><em>只更新一部分参数</em></div>
        <div class="draft-grid">${DRAFT_CELLS}</div>
        <div class="trainable-note">高亮参数带 <b>接收梯度</b></div>
      </div>
    </div>
    <div class="readout"><span>可训练 / 系统参数</span><b>${GLM_TRAINABLE} / ${GLM_SYSTEM}</b><span>DeepSeek ${DEEPSEEK_TRAINABLE} / ${DEEPSEEK_SYSTEM} · 占比 ${GLM_SHARE} / ${DEEPSEEK_SHARE}</span></div>
  `)

  const tl = gsap.timeline()
  const authored = ['.reviewer-a', '.trajectory', '.trajectory .trace-line', '.decision-tag']
  const forked = ['.reviewer-b', '.fork-stage', '.branch-origin', '.re-sample', '.fork-line', '.branch', '.pair-label']
  const trained = ['.training-head', '.target-lane', '.target-rail i', '.freeze', '.train-lane', '.pair-mini div', '.flow', '.dpo', '.draft', '.draft-grid i', '.trainable-note', '.readout']
  gsap.set([...authored, ...forked, ...trained], { autoAlpha: 0 })

  tl.fromTo('.reviewer-a', { autoAlpha: 0, y: -5 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out', immediateRender: false }, T(0, 0.04))
  tl.fromTo('.trajectory', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(0, 0.06))
  tl.fromTo('.trajectory .trace-line', { autoAlpha: 0, y: 6 }, {
    autoAlpha: 1, y: 0, duration: 0.3, ease: 'expo.out', stagger: 0.08, immediateRender: false,
  }, T(0, 0.16))
  tl.to('.decision-fill', { scaleX: 1, duration: 0.55, ease: 'power3.inOut' }, T(0, 0.48))
  tl.fromTo('.decision-tag', { autoAlpha: 0, scale: 0.82 }, {
    autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(1.5)', immediateRender: false,
  }, T(0, 0.68))
  tl.to(['.reviewer-a', '.trajectory'], { autoAlpha: 0, duration: 0.3 }, T(1))
  tl.to('.reviewer-b', { autoAlpha: 1, duration: 0.3 }, T(1, 0.02))
  tl.fromTo('.fork-stage', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(1, 0.05))
  tl.fromTo('.branch-origin', { autoAlpha: 0, scale: 0.4 }, {
    autoAlpha: 1, scale: 1, duration: 0.32, ease: 'back.out(1.7)', immediateRender: false,
  }, T(1, 0.25))
  tl.to('.re-sample', { autoAlpha: 1, duration: 0.3 }, T(1, 0.32))
  tl.to('.fork-line', {
    autoAlpha: 1, strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut', stagger: 0.08,
  }, T(1, 0.36))
  tl.fromTo('.branch', { autoAlpha: 0, y: 8 }, {
    autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.1, immediateRender: false,
  }, T(1, 0.53))
  tl.fromTo('.pair-label', { autoAlpha: 0, scaleX: 0.75 }, {
    autoAlpha: 1, scaleX: 1, duration: 0.35, ease: 'expo.out', immediateRender: false,
  }, T(1, 0.78))

  tl.to(['.reviewer-b', '.fork-stage', '.branch-origin', '.re-sample', '.fork-line', '.branch', '.pair-label'], { autoAlpha: 0, duration: 0.3 }, T(2))
  tl.fromTo('.training-head', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out', immediateRender: false }, T(2, 0.02))
  tl.fromTo('.target-lane', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.08))
  tl.fromTo('.target-rail i', { autoAlpha: 0, scaleX: 0.3 }, {
    autoAlpha: 1, scaleX: 1, duration: 0.25, ease: 'expo.out', stagger: 0.018, immediateRender: false,
  }, T(2, 0.18))
  tl.to('.freeze', { autoAlpha: 1, duration: 0.3 }, T(2, 0.34))
  tl.fromTo('.train-lane', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.38))
  tl.fromTo('.pair-mini div', { autoAlpha: 0, x: -5 }, {
    autoAlpha: 1, x: 0, duration: 0.35, ease: 'expo.out', stagger: 0.09, immediateRender: false,
  }, T(2, 0.44))
  tl.to('.flow', { autoAlpha: 1, duration: 0.2, stagger: 0.08 }, T(2, 0.55))
  tl.fromTo('.dpo', { autoAlpha: 0, scale: 0.72 }, {
    autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(1.45)', immediateRender: false,
  }, T(2, 0.61))
  tl.fromTo('.draft', { autoAlpha: 0, x: 8 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.69))
  tl.fromTo('.draft-grid i', { autoAlpha: 0, scaleY: 0.25 }, {
    autoAlpha: 1, scaleY: 1, duration: 0.25, ease: 'expo.out', stagger: 0.025, immediateRender: false,
  }, T(2, 0.73))
  tl.to('.trainable-note', { autoAlpha: 1, duration: 0.3 }, T(2, 0.84))
  tl.fromTo('.readout', { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'expo.out', immediateRender: false }, T(2, 0.9))
  tl.set({}, {}, T(3))
  return tl
})
