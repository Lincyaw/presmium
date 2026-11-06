import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { PAPER, PAPER_COLOURS, TERMS } from './paper.ts'

const TOKENS = ['last', 'Both', 'could', 'work', '.', 'Likely', 'spec', 'says']
const FRESH = ['The', 'spec', 'says', 'principle', '.', 'Then', 'run', 'tests']

const SLOTS = TOKENS.map((token, slot) => `<div class="slot slot${slot}${slot === 5 ? ' decision-slot' : ''}" style="--shade:${(slot / 7).toFixed(3)}">
  <span class="idx">${slot}</span><span class="tok">${token}</span>${slot < 5 ? '<span class="check">✓</span>' : ''}
</div>`).join('')

const FRESH_SLOTS = FRESH.map((token, slot) => `<div class="slot fresh-slot fresh${slot}${slot < 4 ? ' fresh-key' : ' normal-slot'}" style="--shade:${(slot / 7).toFixed(3)}">
  <span class="idx">${slot}</span><span class="tok">${token}</span>${slot === 0 ? '<span class="fresh-tag">首 token</span>' : ''}${slot > 3 ? '<span class="check">✓</span>' : ''}
</div>`).join('')

// One verification block carries the whole method: ordinary acceptance fixes the decision's landing slot,
// a targeted rejection resamples from the residual, and the restarted block writes the decision from slot 0.
// Every picture is a seekable function of scene time; there are no callbacks or wall-clock effects.
export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)

  frame(root, `${PAPER_COLOURS}
    .mode { position: absolute; left: 7cqw; top: 9cqh; display: flex; align-items: center; gap: 1.2cqw; white-space: nowrap; }
    .mode-label { display: inline-flex; align-items: center; gap: 0.65cqw; font-size: ${TYPE.small}cqw; font-weight: 750; }
    .mode-label i { width: 0.75cqw; height: 0.75cqw; border-radius: 50%; background: currentColor; }
    .ordinary-mode, .adversarial-mode { color: var(--c-draft); }
    .block-meta { margin-left: 0.8cqw; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .title { position: absolute; left: 7cqw; top: 13.5cqh; font-size: ${TYPE.lead}cqw; font-weight: 800; line-height: 1.18; white-space: nowrap; }
    .block { position: absolute; left: 7cqw; top: 22cqh; width: 86cqw; height: 10.5cqh; }
    .slots { display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.65cqw; height: 100%; }
    .slot { position: relative; height: 100%; border-radius: 0.8cqw; overflow: hidden; background:
      color-mix(in srgb, color-mix(in srgb, var(--c-noisy) calc(var(--shade) * 100%), var(--c-precise)) 28%, var(--pm-color-surface));
      color: var(--pm-color-ink);
      display: grid; place-items: center; font-family: var(--pm-font-mono); font-size: ${TYPE.label}cqw; font-weight: 650;
      box-shadow: inset 0 -0.45cqw 0 color-mix(in srgb, color-mix(in srgb, var(--c-noisy) calc(var(--shade) * 100%), var(--c-precise)) 82%, var(--pm-color-surface)),
        inset 0 0 0 0.1cqw var(--pm-color-line-strong); }
    .slot .idx { position: absolute; left: 0.55cqw; top: 0.55cqh; font-size: ${TYPE.tiny}cqw; opacity: 0.74; }
    .slot .tok { margin-top: 1.3cqh; white-space: nowrap; }
    .decision-slot .tok { font-family: var(--pm-font-sans); font-weight: 800; }
    .check { position: absolute; right: 0.45cqw; top: 0.45cqh; width: 1.55cqw; height: 1.55cqw; display: grid; place-items: center;
      border-radius: 50%; background: var(--pm-color-ok-soft); color: var(--pm-color-ok); font-size: ${TYPE.tiny}cqw; font-weight: 800; }
    .pin { position: absolute; left: 62.6%; top: -6.4cqh; width: 12.2%; text-align: center; font-size: ${TYPE.small}cqw;
      font-weight: 750; white-space: nowrap; }
    .pin::after { content: ''; position: absolute; left: 50%; bottom: -1.9cqh; width: 0.18cqw; height: 1.5cqh;
      background: currentColor; transform: translateX(-50%); }
    .pin-normal { color: var(--pm-color-ink); }
    .pin-adversarial { color: var(--c-draft); }
    .precision { position: absolute; left: 7cqw; top: 35cqh; width: 86cqw; display: flex; align-items: center; gap: 1.2cqw;
      font-size: ${TYPE.small}cqw; font-weight: 700; white-space: nowrap; }
    .precision i { flex: 1; height: 0.28cqw; border-radius: 99cqw;
      background: linear-gradient(90deg, var(--c-precise), var(--c-noisy)); }
    .precise { color: var(--c-precise); } .noisy { color: var(--c-noisy); }
    .ordinary-note { position: absolute; left: 7cqw; top: 43cqh; width: 86cqw; font-size: ${TYPE.label}cqw; }
    .ordinary-note b { color: var(--c-draft); }
    .reject-overlay { position: absolute; left: 62.6%; top: 0; width: 12.2%; height: 100%; border: 0.3cqw solid var(--c-reject);
      border-radius: 0.85cqw; background: color-mix(in srgb, var(--c-reject) 13%, transparent); }
    .reject-overlay::after { content: ''; position: absolute; left: 10%; top: 48%; width: 80%; height: 0.28cqw;
      background: var(--c-reject); transform: rotate(-13deg); transform-origin: center; }
    .reject-x { position: absolute; right: 0.35cqw; top: 0.2cqh; font-size: 3.1cqw; line-height: 1; color: var(--c-reject); font-weight: 500; }
    .settle { position: absolute; left: 7cqw; top: 42.5cqh; width: 86cqw; display: flex; align-items: center; gap: 0.85cqw;
      font-size: ${TYPE.label}cqw; white-space: nowrap; }
    .settle b { font-weight: 800; }
    .settle .reject-word { color: var(--c-reject); }
    .settle .target-word { color: var(--c-target); }
    .settle .arrow { color: var(--pm-color-muted); font-size: ${TYPE.lead}cqw; }
    .settle .invariant { margin-left: auto; padding-left: 1.5cqw; border-left: 0.14cqw solid var(--pm-color-line-strong);
      color: var(--pm-color-muted); }
    .settle .invariant b { color: var(--pm-color-ink); }
    .old-caption { position: absolute; left: 7cqw; top: 30.5cqh; padding: 0.3cqw 0.6cqw; border-radius: 0.4cqw;
      background: var(--pm-color-surface); font-size: ${TYPE.tiny}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .fresh { position: absolute; left: 7cqw; top: 45cqh; width: 86cqw; height: 10.5cqh; }
    .fresh-head { position: absolute; left: 0; top: -7.4cqh; display: flex; align-items: baseline; gap: 1cqw; white-space: nowrap; }
    .fresh-head b { font-size: ${TYPE.lead}cqw; color: var(--c-precise); }
    .fresh-head span { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .fresh0 { box-shadow: inset 0 0 0 0.32cqw var(--pm-color-ink), 0 0 3cqh color-mix(in srgb, var(--c-precise) 18%, transparent); }
    .fresh-tag { position: absolute; left: 0.5cqw; bottom: 0.5cqh; font-family: var(--pm-font-sans); font-size: ${TYPE.tiny}cqw;
      font-weight: 750; color: var(--c-target); white-space: nowrap; }
    .fresh-key { box-shadow: inset 0 -0.28cqw var(--c-precise); }
    .normal-slot { box-shadow: inset 0 0 0 0.12cqw var(--c-accept); }
    .summary { position: absolute; left: 7cqw; top: 61.5cqh; width: 86cqw; display: flex; align-items: center; gap: 2.4cqw;
      font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .summary span { display: inline-flex; align-items: baseline; gap: 0.55cqw; }
    .summary b { font-size: ${TYPE.body}cqw; color: var(--pm-color-ink); }
    .summary .key b { color: var(--c-precise); }
    .summary .speed b { color: var(--c-accept); }
    .restart-path { fill: none; stroke: var(--c-target); stroke-width: 0.55; stroke-linecap: round; }
    .restart-head { fill: var(--c-target); }
  `, `
    ${brand(PAPER.short)}
    <div class="mode">
      <span class="mode-label ordinary-mode"><i></i>ordinary draft</span>
      <span class="mode-label adversarial-mode"><i></i>adversarial draft</span>
      <span class="block-meta">${TERMS.verificationBlock} · 8 slots</span>
    </div>
    <div class="title ordinary-title">接受前缀越长，decision point 越靠后</div>
    <div class="title adversarial-title">在关键处主动提出应拒绝的判断</div>

    <div class="block">
      <div class="slots">${SLOTS}</div>
      <div class="pin pin-normal">decision point</div>
      <div class="pin pin-adversarial">应拒绝的判断</div>
      <div class="reject-overlay"><span class="reject-x">×</span></div>
    </div>
    <div class="precision"><span class="precise">slot 0 · 最精确</span><i></i><span class="noisy">slot 7 · 最粗糙</span></div>
    <div class="ordinary-note">同一段草稿连续接受后，<b>decision point 落在 slot 5</b></div>
    <div class="settle"><span class="target-word">${TERMS.targetModel}</span><b class="reject-word">拒绝</b><span class="arrow">→</span>
      <span class="target-word">${TERMS.residualDistribution}</span><b>重新采样</b><span class="invariant">${TERMS.outputDistribution} <b>不变</b></span></div>

    <div class="old-caption">已接受前缀保留在上下文 · 旧 verification block 停在 slot 5</div>
    <svg class="layer" ${LAYER}>
      <path class="restart-path" d="M53,23 C48,27 49,31 42,32 L3,32 C1.8,32 1.8,42 2,46 L18.5,46"/>
      <path class="restart-head" d="M20,46 L15.8,44.2 L16.8,48 Z"/>
    </svg>
    <div class="fresh">
      <div class="fresh-head"><b>新的 ${TERMS.verificationBlock}</b><span>拒绝后从 slot 0 重新开始</span></div>
      <div class="slots">${FRESH_SLOTS}</div>
    </div>
    <div class="summary">
      <span>${TERMS.outputDistribution} <b>不变</b></span>
      <span class="key">关键决策首 token <b>slot 0</b></span>
      <span class="speed">普通 token <b>acceptance rate 高</b></span>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set([
    '.ordinary-mode', '.ordinary-title', '.ordinary-note', '.pin-normal', '.precision', '.block', '.check',
    '.adversarial-mode', '.adversarial-title', '.pin-adversarial', '.reject-overlay', '.settle',
    '.old-caption', '.restart-path', '.restart-head', '.fresh', '.fresh-slot', '.summary',
  ], { autoAlpha: 0 })
  gsap.set('.block', { scale: 1, transformOrigin: '0% 0%' })
  gsap.set('.restart-path', { drawSVG: '0%' })

  // State 0: ordinary acceptance advances through slot 4; the next key decision lands at slot 5.
  tl.to('.block', { autoAlpha: 1, duration: 0.01 }, T(0, 0.02))
  tl.to('.slot:not(.fresh-slot)', { autoAlpha: 1, duration: 0.32, stagger: 0.055, ease: 'expo.out' }, T(0, 0.1))
  tl.to('.ordinary-mode', { autoAlpha: 1, duration: 0.3 }, T(0, 0.06))
  tl.to('.ordinary-title', { autoAlpha: 1, duration: 0.35 }, T(0, 0.15))
  tl.to('.pin-normal', { autoAlpha: 1, duration: 0.3 }, T(0, 0.52))
  tl.to('.check', { autoAlpha: 1, duration: 0.24, stagger: 0.06, ease: 'expo.out' }, T(0, 0.3))
  tl.to('.precision', { autoAlpha: 1, duration: 0.35 }, T(0, 0.62))
  tl.to('.ordinary-note', { autoAlpha: 1, duration: 0.35 }, T(0, 0.7))

  // State 1: the same block, with the proposal at slot 5 rejected; the target resamples without moving its distribution.
  tl.to(['.ordinary-mode', '.ordinary-title', '.ordinary-note', '.pin-normal'], { autoAlpha: 0, duration: 0.25 }, T(1))
  tl.to('.adversarial-mode', { autoAlpha: 1, duration: 0.3 }, T(1, 0.03))
  tl.to('.adversarial-title', { autoAlpha: 1, duration: 0.35 }, T(1, 0.08))
  tl.to('.pin-adversarial', { autoAlpha: 1, duration: 0.3 }, T(1, 0.34))
  tl.fromTo('.reject-overlay', { autoAlpha: 0, scale: 0.92, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: 0.38, ease: 'back.out(1.5)', immediateRender: false }, T(1, 0.42))
  tl.fromTo('.settle', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(1, 0.58))

  // State 2: the rejected block becomes the trace of the cause; a new block writes the decision from slot 0,
  // then ordinary tokens resume high-frequency acceptance.
  tl.to(['.adversarial-mode', '.adversarial-title', '.pin-adversarial', '.precision', '.settle'],
    { autoAlpha: 0, duration: 0.25 }, T(2))
  tl.to('.block', { autoAlpha: 0.26, scale: 0.44, duration: 0.55, ease: 'power3.inOut' }, T(2, 0.02))
  tl.to('.old-caption', { autoAlpha: 1, duration: 0.3 }, T(2, 0.2))
  tl.to('.restart-path', { autoAlpha: 1, duration: 0.01 }, T(2, 0.28))
  tl.to('.restart-path', { drawSVG: '100%', duration: 0.65, ease: 'power2.inOut' }, T(2, 0.28))
  tl.to('.restart-head', { autoAlpha: 1, duration: 0.3 }, T(2, 0.54))
  tl.to('.fresh', { autoAlpha: 1, duration: 0.01 }, T(2, 0.4))
  tl.fromTo('.fresh-head', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.4))
  tl.to('.fresh0', { autoAlpha: 1, duration: 0.32, ease: 'expo.out' }, T(2, 0.52))
  tl.to('.fresh1, .fresh2, .fresh3', { autoAlpha: 1, duration: 0.3, stagger: 0.07, ease: 'expo.out' }, T(2, 0.58))
  tl.to('.fresh4, .fresh5, .fresh6, .fresh7', { autoAlpha: 1, duration: 0.3, stagger: 0.06, ease: 'expo.out' }, T(2, 0.7))
  tl.to('.summary', { autoAlpha: 1, duration: 0.4 }, T(2, 0.82))
  tl.set({}, {}, T(3))
  return tl
})
