import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'

// A and B retain their identities throughout the token-level teaching example.
// All vectors below show one logit coordinate. They are teaching calculations,
// never experimental measurements. State reconstruction uses tweens and sets only.
const C = { q: '#4C72B0', drift: '#C65D4A', signal: '#087F78', tis: '#DD8452', pg: '#55A868' }
const txt = (x: number, y: number, value: string, cls = '', size = 3.2) =>
  '<text class="' + cls + '" x="' + x + '" y="' + y + '" font-size="' + size + '">' + escape(value) + '</text>'
const path = (x: number, y: number, end: number) => {
  const sign = end === x ? 0 : end > x ? 1 : -1
  const wing = Math.abs(sign) * 1.4
  return 'M ' + x + ' ' + y + ' L ' + end + ' ' + y + ' M ' + (end - sign * 2) + ' ' + (y - wing) + ' L ' + end + ' ' + y + ' L ' + (end - sign * 2) + ' ' + (y + wing)
}
const arrow = (cls: string, x: number, y: number, end: number, color: string, width = 0.65) =>
  '<path class="' + cls + '" d="' + path(x, y, end) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>'
const line = (x1: number, y1: number, x2: number, y2: number, cls = '') =>
  '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--c-line-strong)" stroke-width=".3"/>'
const token = (x: number, y: number, name: string, cls = '') => name === 'A'
  ? '<g class="' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="3.3" fill="' + C.q + '"/><text x="' + x + '" y="' + (y + 1.1) + '" text-anchor="middle" style="fill:var(--pm-color-surface)" font-size="3">' + name + '</text></g>'
  : '<g class="' + cls + '"><rect x="' + (x - 3.3) + '" y="' + (y - 3.3) + '" width="6.6" height="6.6" rx=".5" fill="var(--c-muted)"/><text x="' + x + '" y="' + (y + 1.1) + '" text-anchor="middle" style="fill:var(--pm-color-surface)" font-size="3">' + name + '</text></g>'

const apparatus = (q = .5, a = .5, b = -.5) =>
  '<g class="probabilities">' +
    txt(10, 25, '训练 p', '', 3) + txt(10, 34, '采样 q', 'q', 3) +
    '<rect x="27" y="20" width="50" height="6" rx=".6" fill="var(--c-line)"/>' +
    '<rect x="27" y="20" width="25" height="6" rx=".6" fill="var(--c-ink)"/>' +
    '<rect x="27" y="29" width="50" height="6" rx=".6" fill="var(--c-line)"/>' +
    '<rect class="qA" x="27" y="29" width="' + (50 * q) + '" height="6" rx=".6" fill="' + C.q + '"/>' +
    txt(84, 25, 'p(A)=0.5　p(B)=0.5', '', 2.8) +
    txt(84, 34, 'q(A)=' + q.toFixed(1) + '　q(B)=' + (1 - q).toFixed(1), 'qValue', 2.8) +
  '</g>' +
  '<g class="score-plane">' +
    line(18, 48, 145, 48) + line(95, 39, 95, 58) +
    txt(94, 61, '0', '', 2.6) + txt(131, 61, '正方向', 'muted', 2.6) + txt(41, 61, '负方向', 'muted', 2.6) +
    token(14, 42, 'A') + token(14, 54, 'B') +
    arrow('scoreA', 95, 42, 95 + a * 70, C.q) +
    arrow('scoreB', 95, 54, 95 + b * 70, 'var(--c-muted)') +
    txt(23, 43, 's_A = ' + a.toFixed(1), 'sAValue', 3) +
    txt(23, 55, 's_B = ' + b.toFixed(1), 'sBValue', 3) +
  '</g>'

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const page = String(parameters.page ?? 'zero')
  const { T } = clock(at, durations)
  const tl = gsap.timeline()
  let html = ''
  let count = 3
  const css = [
    '.heading{position:absolute;left:6cqw;top:10cqh;right:5cqw;font-size:3cqw;font-weight:780;line-height:1.2}',
    '.source{position:absolute;right:3cqw;top:3cqh;max-width:58cqw;font-size:.9cqw;line-height:1.4;text-align:right;color:var(--c-muted)}',
    'svg text{font-variant-numeric:tabular-nums}',
    '.q{color:' + C.q + '} .drift{color:' + C.drift + '} .signal{color:' + C.signal + '}',
    '.formula{font-family:var(--pm-font-mono);font-weight:650}',
    '.small{font-size:2.6cqw}.strong{font-weight:750}',
  ].join('')
  const start = (body: string, note = '教学算例 · 固定前缀 · 单个 logit 坐标') => {
    frame(root, css, brand('Score Centering') +
      '<div class="heading">' + escape(String(parameters.title ?? '')) + '</div>' +
      '<svg class="layer" ' + LAYER + '>' + body + '</svg>' +
      '<div class="source">' + escape(note) + '</div>')
  }
  const hide = (s: string) => gsap.set(s, { autoAlpha: 0 })
  const show = (s: string, k: number, f: number, duration = .5) => tl.to(s, { autoAlpha: 1, duration }, T(k, f))
  const setText = (s: string, value: string, k: number, f: number) => tl.set(s, { textContent: value }, T(k, f))

  if (page === 'loop') {
    count = 4
    html = txt(14, 25, '题目', 'strong', 3.4) +
      '<rect x="10" y="29" width="38" height="16" rx="1" fill="var(--c-sunk)" stroke="var(--c-line-strong)" stroke-width=".3"/>' +
      txt(14, 36, '给定几个数字', '', 3) + txt(14, 41, '组合出目标值', '', 3) +
      '<g class="sampler"><rect x="63" y="22" width="33" height="24" rx="2" fill="var(--c-surface)" stroke="' + C.q + '" stroke-width=".6"/>' +
      txt(67, 29, '采样器 q', 'strong q', 3.4) + txt(67, 36, '生成回答', '', 3) +
      '<rect class="qFirst" x="67" y="40" width="12" height="2.5" fill="' + C.q + '"/><rect class="qHalf" x="79" y="40" width="12" height="2.5" fill="var(--c-line-strong)"/></g>' +
      '<g class="trainer"><rect x="113" y="22" width="34" height="24" rx="2" fill="var(--c-surface)" stroke="var(--c-ink)" stroke-width=".6"/>' +
      txt(117, 29, '训练器 p', 'strong', 3.4) + txt(117, 36, '计算梯度', '', 3) +
      '<rect x="117" y="40" width="12" height="2.5" fill="var(--c-ink)"/><rect x="129" y="40" width="12" height="2.5" fill="var(--c-line-strong)"/></g>' +
      arrow('toQ', 49, 35, 60, 'var(--c-muted)', .4) +
      arrow('toP', 98, 35, 110, 'var(--c-muted)', .4) +
      token(79, 34, 'A', 'traveller') +
      '<path class="sync" d="M130 47 V57 H79 V48 M77 50 L79 48 L81 50" fill="none" stroke="var(--c-accent)" stroke-width=".6" stroke-linejoin="round"/>' +
      txt(92, 62, '更新 → 同步权重', 'syncLabel', 3) +
      txt(18, 57, '奖励 R', 'reward', 3.4) +
      txt(64, 17, '吞吐量优先', 'engineLabel', 2.6) +
      txt(113, 17, '训练计算优先', 'engineLabel', 2.6) +
      txt(61, 69, '同一前缀，p ≠ q：TIM', 'tim strong', 3.4)
    start(html, '论文 §2、§4 · 训练与采样的分工')
    hide('.sampler,.trainer,.toQ,.toP,.traveller,.sync,.syncLabel,.reward,.tim,.engineLabel')
    show('.sampler,.toQ', 0, .12)
    show('.traveller', 0, .35, .1)
    tl.to('.traveller', { x: 21, duration: 1.2, ease: 'power2.inOut' }, T(0, .4))
    show('.trainer,.toP,.reward', 0, .58)
    show('.engineLabel', 1, .12)
    tl.to('.traveller', { x: 62, duration: 1.4, ease: 'power2.inOut' }, T(1, .32))
    tl.to('.qFirst', { attr: { width: 16 }, duration: 1.3 }, T(2, .2))
    tl.to('.qHalf', { attr: { x: 83, width: 8 }, duration: 1.3 }, T(2, .2))
    show('.tim', 2, .52)
    gsap.set('.sync', { drawSVG: '0%' })
    show('.sync', 3, .1, .1)
    tl.to('.sync', { drawSVG: '100%', duration: 2.2, ease: 'none' }, T(3, .2))
    show('.syncLabel', 3, .4)
  } else if (page === 'score') {
    const pts = Array.from({ length: 81 }, (_, i) => {
      const z = -3 + i * 6 / 80
      const logp = -Math.log1p(Math.exp(-z))
      return [81 + z * 16, 61 - (logp + 3.1) * 11]
    })
    html = '<g class="prefix">' + ['已知', '若干', '数字', '下一词'].map((v, i) =>
      '<rect x="' + (12 + i * 27) + '" y="22" width="23" height="8" rx=".8" fill="var(--c-sunk)" stroke="var(--c-line-strong)" stroke-width=".3"/>' + txt(14 + i * 27, 27.5, v, '', 3.2)).join('') +
      '<path class="prefixBrace" d="M12 33 V35 H89 V33" fill="none" stroke="' + C.q + '" stroke-width=".6"/>' +
      txt(42, 40, '前缀 y_<t', 'prefixLabel q', 3.2) +
      token(131, 26, 'A', 'chosen') + '</g>' +
      '<g class="curve">' + line(24, 62, 138, 62) + line(81, 17, 81, 64) +
      '<path d="M' + pts.map(p => p.join(',')).join(' L') + '" stroke="' + C.q + '" stroke-width=".65" fill="none"/>' +
      txt(122, 68, '参数 θ', '', 3) + txt(27, 21, 'log p(A)', '', 3.4) +
      '<circle class="point" cx="81" cy="' + (61 - (Math.log(.5) + 3.1) * 11) + '" r="1.3" fill="' + C.q + '"/>' +
      '<path class="tangent" d="M61 41.3996 L101 27.6496" fill="none" stroke="' + C.drift + '" stroke-width=".7"/>' +
      txt(93, 25, '局部斜率 = 0.5', 'derivative drift', 3.2) + '</g>' +
      '<g class="vectors">' + line(15, 45, 145, 45) + line(79, 25, 79, 60) +
      token(15, 32, 'A') + token(15, 56, 'B') +
      arrow('vA', 79, 32, 114, C.q) + arrow('vB', 79, 56, 44, 'var(--c-muted)') +
      txt(119, 33, '+0.5', '', 3.4) + txt(26, 57, '−0.5', '', 3.4) +
      txt(35, 67, 's_v = ∇θ log p_v', 'formula', 4.2) + '</g>'
    start(html, '论文 §4 · score 是 log 概率对参数的梯度；此处取单个坐标')
    hide('.curve,.vectors,.prefixLabel,.prefixBrace,.tangent,.derivative')
    show('.prefixBrace', 0, .15)
    show('.prefixLabel', 0, .38)
    tl.to('.prefix', { autoAlpha: 0, duration: .45 }, T(1))
    show('.curve', 1, 0)
    gsap.set('.tangent', { drawSVG: '0%' })
    show('.tangent', 1, .22, .1)
    tl.to('.tangent', { drawSVG: '100%', duration: 1.4 }, T(1, .22))
    show('.derivative', 1, .5)
    show('.vectors', 2, 0)
    tl.to('.curve', { autoAlpha: 0, duration: .45 }, T(2))
    gsap.set('.vA,.vB', { drawSVG: '0%' })
    tl.to('.vA', { drawSVG: '100%', duration: 1.2 }, T(2, .2))
    tl.to('.vB', { drawSVG: '100%', duration: 1.2 }, T(2, .42))
  } else if (['zero', 'mismatch', 'center', 'signal'].includes(page)) {
    const initialQ = page === 'center' || page === 'signal' ? .6 : .5
    html = apparatus(initialQ, page === 'signal' ? .4 : .5, page === 'signal' ? -.6 : -.5) +
      '<g class="bottom">' +
      arrow('meanArrow', 95, 66, 95, C.drift, .85) +
      txt(10, 68, '', 'equation formula', 3.5) +
      '</g>' +
      txt(103, 69, '', 'answer strong', 4.1) +
      txt(108, 19, '', 'stage strong', 3.4) +
      '<g class="rewardTokens">' + txt(132, 43, 'R_A=1', 'signal', 2.8) + txt(132, 55, 'R_B=0', 'muted', 2.8) + '</g>' +
      '<g class="shiftGuide">' + arrow('shiftA', 133, 39, 126, 'var(--c-accent)', .4) +
      arrow('shiftB', 63, 51, 56, 'var(--c-accent)', .4) +
      txt(126, 36, '−0.1', '', 2.6) + txt(56, 46, '−0.1', '', 2.6) + '</g>' +
      txt(104, 64, '', 'comparison', 3)
    start(html)
    hide('.meanArrow,.rewardTokens,.shiftGuide')
    if (page === 'zero') {
      setText('.stage', 'p = q', 0, .04)
      setText('.equation', 's_A=1−p_A　s_B=−p_A', 0, .48)
      tl.to('.scoreA', { attr: { d: path(95, 42, 112.5) }, duration: 1.5 }, T(1, .2))
      tl.to('.scoreB', { attr: { d: path(95, 54, 77.5) }, duration: 1.5 }, T(1, .36))
      setText('.sAValue', '0.5 × (+0.5)', 1, .2)
      setText('.sBValue', '0.5 × (−0.5)', 1, .36)
      setText('.equation', '概率 × score', 1, .54)
      tl.to('.scoreA', { attr: { d: path(95, 42, 112.5) }, y: 6, duration: 1.2 }, T(2, .18))
      tl.to('.scoreB', { attr: { d: path(112.5, 54, 95) }, y: -6, duration: 1.2 }, T(2, .34))
      setText('.equation', '0.25 − 0.25', 2, .52)
      setText('.answer', '= 0', 2, .62)
    } else if (page === 'mismatch') {
      tl.to('.qA', { attr: { width: 30 }, duration: 1.6 }, T(0, .2))
      setText('.qValue', 'q(A)=0.6　q(B)=0.4', 0, .28)
      setText('.stage', 'p ≠ q', 0, .45)
      tl.to('.scoreA', { attr: { d: path(95, 42, 116) }, duration: 1.5 }, T(1, .12))
      tl.to('.scoreB', { attr: { d: path(95, 54, 81) }, duration: 1.5 }, T(1, .27))
      setText('.sAValue', '0.6 × (+0.5)', 1, .12)
      setText('.sBValue', '0.4 × (−0.5)', 1, .27)
      setText('.equation', '0.30 − 0.20', 1, .48)
      show('.meanArrow', 1, .6, .1)
      tl.to('.meanArrow', { attr: { d: path(95, 66, 102) }, duration: 1.2 }, T(1, .61))
      setText('.answer', '= 0.10', 1, .68)
      setText('.stage', '恒定 R = 1', 2, .12)
      setText('.equation', 'E_q[R s] = 1 × 0.10', 2, .38)
      setText('.answer', '≠ 0', 2, .54)
    } else if (page === 'center') {
      setText('.stage', '平均 score', 0, .08)
      setText('.equation', '0.6×0.5 + 0.4×(−0.5)', 0, .3)
      show('.meanArrow', 0, .5, .1)
      tl.to('.meanArrow', { attr: { d: path(95, 66, 102) }, duration: 1.2 }, T(0, .5))
      setText('.answer', '= 0.10', 0, .63)
      show('.shiftGuide', 1, .12)
      tl.to('.scoreA', { attr: { d: path(95, 42, 123) }, duration: 1.6 }, T(1, .26))
      tl.to('.scoreB', { attr: { d: path(95, 54, 53) }, duration: 1.6 }, T(1, .4))
      setText('.sAValue', 's̃_A = 0.4', 1, .37)
      setText('.sBValue', 's̃_B = −0.6', 1, .51)
      setText('.equation', 's̃_y = s_y − s̄', 1, .58)
      setText('.answer', '', 1, .04)
      setText('.stage', '同一个平移量', 1, .2)
      tl.to('.shiftGuide', { autoAlpha: 0, duration: .35 }, T(2))
      tl.to('.scoreA', { attr: { d: path(95, 42, 111.8) }, duration: 1.4 }, T(2, .14))
      tl.to('.scoreB', { attr: { d: path(95, 54, 78.2) }, duration: 1.4 }, T(2, .28))
      setText('.sAValue', '0.6 × 0.4 = 0.24', 2, .14)
      setText('.sBValue', '0.4 × (−0.6) = −0.24', 2, .28)
      tl.to('.meanArrow', { attr: { d: path(95, 66, 95) }, duration: 1 }, T(2, .47))
      setText('.equation', 'E_q[s̃] = 0.24 − 0.24', 2, .5)
      setText('.answer', '= 0', 2, .64)
    } else {
      setText('.stage', '不同奖励', 0, .05)
      show('.rewardTokens', 0, .24)
      setText('.equation', 'A 得 1；B 得 0', 0, .52)
      setText('.stage', '保留奖励相关变化', 1, .05)
      setText('.equation', '更新 0.30 − 漂移 0.06', 1, .16)
      tl.to('.scoreA', { attr: { d: path(95, 42, 111.8) }, duration: 1.6 }, T(1, .32))
      tl.to('.scoreB', { attr: { d: path(95, 54, 95) }, duration: 1.6 }, T(1, .32))
      setText('.sAValue', '0.6 × 1 × 0.4', 1, .32)
      setText('.sBValue', '0.4 × 0 × (−0.6)', 1, .32)
      setText('.answer', '= 0.24', 1, .58)
      setText('.equation', 'Cov_q(R,s)', 2, .12)
      setText('.stage', '协方差仍在 q 下', 2, .2)
      setText('.comparison', 'p 下为 0.25', 2, .5)
    }
  } else if (page === 'feedback') {
    html = txt(11, 21, '固定采样器', 'strong', 3.4) +
      line(20, 34, 143, 34) +
      '<circle class="fixedP" cx="31" cy="34" r="3.6" fill="none" stroke="var(--c-ink)" stroke-width=".7"/><rect x="96" y="31.5" width="5" height="5" fill="' + C.q + '"/>' +
      txt(26, 29, 'p', 'fixedPLabel', 3.3) + txt(95, 29, 'q 固定', 'q', 3.3) +
      '<g class="online">' + txt(11, 45, '随训练同步', 'strong', 3.4) +
      line(20, 57, 143, 57) + '<circle class="movingP" cx="31" cy="57" r="2" fill="var(--c-ink)"/>' +
      '<rect class="movingQ" x="48" y="54.5" width="5" height="5" fill="' + C.q + '"/>' +
      '<path class="syncLoop" d="M43 62 C30 73 16 68 20 60" fill="none" stroke="var(--c-accent)" stroke-width=".6"/>' +
      txt(27, 51, 'p', 'movingPLabel', 3.3) + txt(47, 51, 'q', 'q movingQLabel', 3.3) + '</g>' +
      '<g class="traces">' + [31, 49, 67, 85, 103, 121].map((x, i) => '<circle class="trace trace' + i + '" cx="' + x + '" cy="57" r=".8" fill="' + C.drift + '"/>').join('') + '</g>' +
      txt(57, 68, '偏差随同步循环累积', 'result drift strong', 3.6)
    start(html, '论文 §4 · 机制示意；横轴表示参数变化，不是实验曲线')
    hide('.online,.traces,.result')
    tl.to('.fixedP', { attr: { cx: 98.5 }, duration: 4, ease: 'power2.out' }, T(0, .18))
    tl.to('.fixedPLabel', { attr: { x: 93.5 }, duration: 4, ease: 'power2.out' }, T(0, .18))
    show('.online', 1, .02)
    gsap.set('.syncLoop', { drawSVG: '0%' })
    tl.to('.movingP', { attr: { cx: 49 }, duration: 1.5 }, T(1, .2))
    tl.to('.movingPLabel', { attr: { x: 45 }, duration: 1.5 }, T(1, .2))
    tl.to('.movingQ', { attr: { x: 66 }, duration: 1.5 }, T(1, .38))
    tl.to('.movingQLabel', { attr: { x: 66 }, duration: 1.5 }, T(1, .38))
    tl.to('.syncLoop', { drawSVG: '100%', duration: 1.5 }, T(1, .48))
    show('.traces', 2, .01, .1)
    hide('.trace')
    for (let i = 0; i < 5; i++) {
      show('.trace' + i, 2, .08 + i * .11, .1)
      tl.to('.movingP', { attr: { cx: 49 + i * 18 }, duration: .9, ease: 'none' }, T(2, .08 + i * .11))
      tl.to('.movingQ', { attr: { x: 66 + i * 14 }, duration: .9, ease: 'none' }, T(2, .14 + i * .11))
      tl.to('.movingPLabel', { attr: { x: 45 + i * 18 }, duration: .9, ease: 'none' }, T(2, .08 + i * .11))
      tl.to('.movingQLabel', { attr: { x: 66 + i * 14 }, duration: .9, ease: 'none' }, T(2, .14 + i * .11))
    }
    show('.result', 2, .76)
  } else if (page === 'split') {
    html = txt(12, 25, '期望更新', 'strong', 3.8) +
      arrow('whole', 31, 38, 124, 'var(--c-ink)', 1) +
      '<g class="parts">' +
      arrow('driftPart', 31, 48, 65, C.drift, 1) +
      arrow('signalPart', 65, 48, 124, C.signal, 1) +
      txt(36, 57, '漂移', 'drift strong', 3.6) + txt(86, 57, '信号', 'signal strong', 3.6) + '</g>' +
      '<g class="identity">' +
      txt(13, 68, 'E_q[R s] =', 'formula', 3.5) +
      txt(53, 68, 'E_q[R] s̄', 'formula drift', 3.5) + txt(91, 68, '+', '', 3.5) +
      txt(99, 68, 'Cov_q(R,s)', 'formula signal', 3.5) + '</g>' +
      txt(64, 29, '同一平均奖励', 'sameMean', 3) +
      txt(22, 20, '每个前缀分别分析', 'muted', 2.6)
    start(html, '论文 §4，公式 (3) · 向量分解示意')
    hide('.parts,.identity,.sameMean')
    show('.parts', 0, .22)
    gsap.set('.driftPart,.signalPart', { drawSVG: '0%' })
    tl.to('.driftPart', { drawSVG: '100%', duration: 1.5 }, T(0, .26))
    tl.to('.signalPart', { drawSVG: '100%', duration: 1.8 }, T(0, .45))
    show('.identity', 1, .12)
    tl.to('.driftPart', { y: -10, duration: 1.2 }, T(1, .38))
    tl.to('.signalPart', { y: -10, duration: 1.2 }, T(1, .54))
    show('.sameMean', 2, .06)
    tl.to('.signalPart', { attr: { d: path(65, 48, 93) }, duration: 1.4 }, T(2, .28))
    tl.to('.whole', { attr: { d: path(31, 38, 93) }, duration: 1.4 }, T(2, .28))
    tl.to('.signalPart', { attr: { d: path(65, 48, 112) }, duration: 1.4 }, T(2, .48))
    tl.to('.whole', { attr: { d: path(31, 38, 112) }, duration: 1.4 }, T(2, .48))
  } else if (page === 'group') {
    const ys = [24, 35, 46, 57]
    html = txt(10, 40, '同一道题', 'strong', 3.8) +
      '<g class="branches">' + ys.map((y, i) =>
        '<path d="M34 38 L62 ' + (i < 2 ? 29.5 : 51.5) + ' L100 ' + y + '" fill="none" stroke="var(--c-line-strong)" stroke-width=".4"/>' +
        '<circle cx="106" cy="' + y + '" r="3.4" fill="' + (i < 2 ? C.signal : C.drift) + '"/>' +
        txt(116, y + 1, i < 2 ? '+1' : '−1', i < 2 ? 'signal' : 'drift', 3.4)).join('') + '</g>' +
      '<rect class="prefixBox" x="57" y="18" width="78" height="23" rx="2" fill="none" stroke="' + C.q + '" stroke-width=".7"/>' +
      txt(60, 23, '已走到的前缀', 'prefixLabel q', 2.8) +
      txt(13, 68, '全组均值：(+1+1−1−1)/4 = 0', 'wholeMean formula', 3.4) +
      txt(76, 67, '条件均值：(+1+1)/2 = +1', 'conditional formula', 3.1) +
      arrow('residual', 15, 60, 44, C.drift) +
      txt(49, 61, '前缀漂移仍存在', 'residualLabel drift', 3.2)
    start(html, '论文 §4 · 四条回答为教学示例；图中数值表示组中心化后的优势')
    hide('.prefixBox,.prefixLabel,.conditional,.residual,.residualLabel')
    gsap.set('.branches path', { drawSVG: '0%' })
    tl.to('.branches path', { drawSVG: '100%', duration: 1.2, stagger: .25 }, T(0, .1))
    show('.prefixBox', 1, .16)
    show('.prefixLabel', 1, .35)
    tl.to('.branches circle,.branches text', { opacity: (i: number) => i >= 4 ? .25 : 1, duration: .7 }, T(1, .45))
    tl.to('.wholeMean', { autoAlpha: 0, duration: .4 }, T(2))
    show('.conditional', 2, .06)
    show('.residual', 2, .25)
    gsap.set('.residual', { drawSVG: '0%' })
    tl.to('.residual', { drawSVG: '100%', duration: 1.3 }, T(2, .28))
    show('.residualLabel', 2, .56)
  } else if (page === 'is') {
    count = 4
    html = apparatus(.6) +
      txt(11, 68, 'r_A=0.5/0.6　r_B=0.5/0.4', 'equation formula', 3.3) +
      txt(104, 68, '', 'answer strong', 3.9) +
      '<g class="rare">' +
      txt(13, 22, '罕见 token C', 'strong', 3.4) + txt(13, 30, 'q_C=0.01　p_C=0.10', '', 3.3) +
      txt(78, 30, 'q_D=0.99　p_D=0.90', '', 3.3) +
      txt(13, 36, 's_C=+0.9　s_D=−0.1', 'muted', 2.7) +
      line(24, 46, 145, 46) + arrow('rareArrow', 24, 46, 34, C.tis, 1) +
      txt(27, 40, 'r_C = 10', 'ratioLabel', 3.7) +
      line(44, 38, 44, 56, 'cap') + txt(36, 61, 'TIS 上界 2', 'capLabel', 3.2) +
      txt(13, 68, '乘法校正 → 大比率 → 截断偏差', '', 3.6) + '</g>' +
      txt(17, 18, '精确 IS', 'exactLabel', 3.2) +
      txt(78, 57, 'E_q[w s] = −0.072', 'clipLabel drift', 3.2)
    start(html, '论文 §2.2、§4 · 罕见 token 部分为独立教学示例')
    hide('.answer,.rare,.clipLabel')
    tl.to('.scoreA', { attr: { d: path(95, 42, 95 + .5 / .6 * .5 * 70) }, duration: 1.5 }, T(0, .2))
    tl.to('.scoreB', { attr: { d: path(95, 54, 95 - .5 / .4 * .5 * 70) }, duration: 1.5 }, T(0, .38))
    setText('.sAValue', 'r_A × s_A', 0, .2)
    setText('.sBValue', 'r_B × s_B', 0, .38)
    setText('.equation', '0.6×r_A×0.5 + 0.4×r_B×(−0.5)', 1, .18)
    setText('.answer', '= 0', 1, .56)
    show('.answer', 1, .56)
    show('.rare', 2, 0)
    tl.to('.probabilities,.score-plane,.equation,.answer,.exactLabel', { autoAlpha: 0, duration: .45 }, T(2))
    hide('.cap,.capLabel')
    tl.to('.rareArrow', { attr: { d: path(24, 46, 124) }, duration: 2.2 }, T(2, .27))
    tl.to('.ratioLabel', { x: 71, duration: 2.2 }, T(2, .27))
    show('.cap,.capLabel', 3, .15)
    tl.to('.rareArrow', { attr: { d: path(24, 46, 44) }, duration: 1.6 }, T(3, .32))
    tl.to('.ratioLabel', { x: 1, duration: 1.6 }, T(3, .32))
    setText('.ratioLabel', 'w_C = 2', 3, .41)
    show('.clipLabel', 3, .65)
  } else if (page === 'compose') {
    html = txt(13, 23, '先加权', 'strong', 3.6) +
      arrow('weightedA', 79, 34, 123, C.tis) +
      arrow('weightedB', 79, 50, 52, C.tis) +
      token(15, 34, 'A') + token(15, 50, 'B') +
      txt(85, 29, 'w_A s_A', 'formula weightedALabel', 3.5) + txt(30, 45, 'w_B s_B', 'formula weightedBLabel', 3.5) +
      line(79, 27, 79, 57) +
      '<g class="mean">' + arrow('weightedMean', 79, 61, 89, C.drift) +
      txt(92, 62, 'm = E_q[w s]', 'formula drift', 3.4) + '</g>' +
      txt(14, 69, 'R ( w_y s_y − E_q[w s] )', 'formula final', 4) +
      txt(100, 22, '再去均值', 'recenter strong', 3.5) +
      txt(84, 57, '', 'sanity strong', 3.4)
    start(html, '论文附录 A.2 · 对加权后的 score 去均值；箭头为结构示意')
    hide('.mean,.final,.recenter,.sanity')
    gsap.set('.weightedA,.weightedB', { drawSVG: '0%' })
    tl.to('.weightedA', { drawSVG: '100%', duration: 1.4 }, T(0, .15))
    tl.to('.weightedB', { drawSVG: '100%', duration: 1.4 }, T(0, .34))
    show('.mean', 0, .58)
    show('.recenter', 1, .12)
    tl.to('.weightedA', { attr: { d: path(79, 34, 113) }, duration: 1.5 }, T(1, .28))
    tl.to('.weightedB', { attr: { d: path(79, 50, 42) }, duration: 1.5 }, T(1, .42))
    setText('.weightedALabel', 'w_A s_A − m', 1, .58)
    setText('.weightedBLabel', 'w_B s_B − m', 1, .58)
    show('.final', 1, .6)
    tl.to('.weightedMean', { attr: { d: path(79, 61, 79) }, duration: 1.3 }, T(1, .6))
    setText('.sanity', '精确 IS：m = 0', 2, .16)
    show('.sanity', 2, .16)
    setText('.final', 'w_v = p_v / q_v　⇒　q_v w_v = p_v', 2, .4)
  } else {
    start(txt(12, 35, '未提供对应的核心页面', '', 4))
  }
  // A final set establishes every full state budget without callback-driven work.
  tl.set({}, {}, T(count))
  return tl
})
