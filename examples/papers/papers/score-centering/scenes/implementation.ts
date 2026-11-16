import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'

// The implementation chapter follows the same probability mass from vocabulary storage,
// through a head/tail model, into a detached scalar loss and the paper's minimal JAX code.
// Each page owns one complete timeline; selecting a later state reconstructs all prior motion.
const CSS = `
  .ititle { position:absolute; left:6cqw; top:10cqh; font-size:${TYPE.title}cqw; font-weight:800; line-height:1.2; }
  .imeta { position:absolute; right:4cqw; top:4cqh; font-size:${TYPE.tiny}cqw; color:var(--c-muted); }
  .ilabel { position:absolute; font-size:${TYPE.body}cqw; line-height:1.3; }
  .ieq { position:absolute; font-family:var(--pm-font-mono); font-size:2.6cqw; white-space:nowrap; }
  .ismall { font-size:${TYPE.small}cqw; color:var(--c-muted); }
  .iblue { color:#4C72B0; } .iteal { color:#087F78; } .icoral { color:#C65D4A; }
  .iorange { color:#DD8452; } .iaccent { color:var(--c-accent); }
  .iline { stroke:var(--c-line-strong); stroke-width:0.2; fill:none; }
  .ihead { fill:#4C72B0; } .itail { fill:var(--c-fit); }

  .iflow { stroke:#087F78; stroke-width:0.55; fill:none; }
  .itoken { position:absolute; width:3.6cqw; height:3.6cqw; display:grid; place-items:center; border:0.14cqw solid var(--c-line-strong); border-radius:0.5cqw; font-size:1.5cqw; background:var(--c-surface); }
  .iresult { position:absolute; font-size:3.2cqw; font-weight:800; white-space:nowrap; }
  .ibrace { position:absolute; height:1.2cqh; border:0.16cqw solid currentColor; border-top:0; }
`
const minimalCode = [
  'def score_centering_loss(train_logp, samp_logp,',
  '                        topk_ids, sampled_token, advantage):',
  '    train_head_logp = train_logp[topk_ids]',
  '    tail_mass_ratio = ((1 - exp(samp_logp).sum()) /',
  '                       (1 - exp(train_head_logp).sum()))',
  '    head_prob_residual = (exp(samp_logp)',
  '                         - tail_mass_ratio * exp(train_head_logp))',
  '    logp_correction = (stop_gradient(head_prob_residual)',
  '                       * train_head_logp).sum()',
  '    return -advantage * (train_logp[sampled_token]',
  '                         - logp_correction)',
]

export default gsapScene(({root,gsap,at,durations,parameters}) => {
  const page = String(parameters.page ?? 'topk')
  const title = escape(String(parameters.title ?? '让 score 中心化可以实际训练'))
  const {T} = clock(at,durations)
  const tl = gsap.timeline()
  let html = ''
  if (page === 'topk') {
    const cells = Array.from({length:60}, (_,i) => `<rect class="vc vc${i} ${i<8?'vh':'vt'}" x="${12+(i%20)*6.2}" y="${30+Math.floor(i/20)*6.2}" width="5.2" height="4.7" rx="0.6" fill="var(--c-sunk)" stroke="var(--c-line-strong)" stroke-width="0.15"/>`).join('')
    const bars = Array.from({length:30},(_,i) => `<rect class="pb pb${i} ${i<8?'ph':'pt'}" x="${14+i*3.15}" y="${59-(24*Math.exp(-i*.15)+2)}" width="2.2" height="${24*Math.exp(-i*.15)+2}" rx="0.35" fill="${i<8?'#4C72B0':'var(--c-fit)'}"/>`).join('')
    html = `
      <div class="ilabel source-token" style="left:8cqw;top:22cqh"><b>生成一个 token</b></div>
      <div class="itoken picked" style="left:29cqw;top:22cqh">A</div>
      <div class="ilabel vocab-label" style="left:39cqw;top:23cqh">152,000 个候选词</div>
      <svg class="layer" ${LAYER}>
        <path class="expand-path" d="M52 24 C63 24 68 30 79 30" stroke="#4C72B0" stroke-width="0.55" fill="none"/>
        <g class="vocabulary-grid">${cells}</g>
        <g class="histogram">${bars}<line x1="12" y1="59" x2="111" y2="59" class="iline"/></g>
      </svg>
      <div class="ilabel grid-scale ismall" style="left:8cqw;top:58cqh">每格代表一组词表项</div>
      <div class="ieq bytes" style="left:10cqw;top:28cqh"><span class="iblue">152,000</span> × 4 B = <b>608 kB</b></div>
      <div class="ilabel batch" style="left:10cqw;top:40cqh">1,024 条回答 × 32,768 token</div>
      <div class="iresult tb icoral" style="left:10cqw;top:53cqh">20.4 TB</div>
      <div class="ilabel decimal ismall" style="left:32cqw;top:56cqh">fp32 全词表 · 十进制估算</div>
      <div class="ilabel head-caption iblue" style="left:10cqw;top:23cqh"><b>采样器 top-k</b></div>
      <div class="ilabel tail-caption" style="left:43cqw;top:23cqh"><b>其余词表</b></div>
      <div class="ibrace head-brace iblue" style="left:8.6cqw;top:67cqh;width:15.6cqw"></div>
      <div class="ilabel k128 iblue" style="left:9cqw;top:69cqh">k = 128</div>
      <div class="ilabel tail-mass" style="left:71cqw;top:36cqh">尾部质量</div>
      <div class="ieq mass-value iteal" style="left:72cqw;top:44cqh">1 − Σ q<tspan>ₕ</tspan></div>
      <div class="ilabel keep-tail ismall" style="left:71cqw;top:56cqh">用训练分布重建</div>
      <div class="imeta">论文附录 A.1 · 词表存储算例</div>
    `
    frame(root,CSS,brand('Score Centering')+`<div class="ititle">${title}</div>`+html)
    gsap.set(['.bytes','.batch','.tb','.decimal','.histogram','.head-caption','.tail-caption','.head-brace','.k128','.tail-mass','.mass-value','.keep-tail'],{autoAlpha:0})
    gsap.set('.vc',{scale:0.2,transformOrigin:'50% 50%',autoAlpha:0})
    gsap.set('.expand-path',{drawSVG:'0%'})
    tl.to('.expand-path',{drawSVG:'100%',duration:1.1},T(0,.16))
    tl.to('.vc',{autoAlpha:1,scale:1,duration:.5,stagger:.025,ease:'power2.out'},T(0,.27))
    tl.to('.vh',{fill:'#4C72B0',duration:.5},T(0,.65))
    // The same vocabulary is compressed into a memory calculation; the grid stays visible at the side.
    tl.to('.vocabulary-grid',{scale:.24,x:100,y:33,transformOrigin:'0 0',duration:1.2,ease:'power2.inOut'},T(1))
    tl.to(['.source-token','.picked','.expand-path','.vocab-label','.grid-scale'],{autoAlpha:0,duration:.4},T(1))
    tl.to('.bytes',{autoAlpha:1,duration:.5},T(1,.08))
    tl.to('.batch',{autoAlpha:1,duration:.5},T(1,.32))
    tl.fromTo('.tb',{autoAlpha:0,scale:.85},{autoAlpha:1,scale:1,duration:.5,immediateRender:false},T(1,.56))
    tl.to('.decimal',{autoAlpha:1,duration:.4},T(1,.6))
    // Storage becomes a ranked probability distribution; only the head is logged.
    tl.to(['.bytes','.batch','.tb','.decimal','.vocabulary-grid'],{autoAlpha:0,duration:.5},T(2))
    tl.to('.histogram',{autoAlpha:1,duration:.5},T(2))
    tl.to(['.head-caption','.tail-caption'],{autoAlpha:1,duration:.4},T(2,.12))
    tl.to('.pt',{opacity:.35,duration:.7},T(2,.3))
    tl.to(['.head-brace','.k128'],{autoAlpha:1,duration:.5},T(2,.5))
    tl.to('.pt',{opacity:1,duration:.8},T(3,.06))
    tl.to('.tail-mass',{autoAlpha:1,duration:.5},T(3,.2))
    tl.to('.mass-value',{autoAlpha:1,duration:.5},T(3,.38))
    tl.to('.keep-tail',{autoAlpha:1,duration:.5},T(3,.6))
    tl.set({}, {},T(4))
    return tl
  }
  if (page === 'tail') {
    const row=(cls:string,y:number,label:string,head:number,tail:number)=>`<g class="${cls}"><text x="13" y="${y-3}" class="isvg" font-size="2.8">${label}</text><rect x="13" y="${y}" width="${head*112}" height="8" rx="1" fill="#4C72B0"/><rect class="${cls}-tail" x="${13+head*112}" y="${y}" width="${tail*112}" height="8" rx="1" fill="var(--c-fit)"/><text x="${13+head*56}" y="${y+5.2}" text-anchor="middle" fill="white" class="isvg" font-size="2.8">头部 ${head.toFixed(1)}</text><text class="${cls}-tail-label" x="${13+head*112+tail*56}" y="${y+5.2}" text-anchor="middle" class="isvg" font-size="2.8">尾部 ${tail.toFixed(1)}</text></g>`
    html=`
      <svg class="layer" ${LAYER}><g class="mass-bars">
        ${row('qrow',24,'采样器 q',.8,.2)}
        ${row('prow',41,'训练器 p · 保持不变',.7,.3)}
        <g class="qhat-track">
          <text x="13" y="55" class="isvg" font-size="2.8">重建 q̂</text>
          <rect x="13" y="58" width="112" height="8" rx="1" fill="none" stroke="var(--c-line-strong)" stroke-width="0.3"/>
          <line x1="125" y1="56.5" x2="125" y2="67" stroke="var(--c-line-strong)" stroke-width="0.25"/>
          <text x="129" y="63.5" class="isvg qhat-total" font-size="2.8">总和 1</text>
        </g>
        <g class="qhat-head-copy">
          <rect class="qhat-head" x="13" y="24" width="89.6" height="8" rx="1" fill="#4C72B0"/>
          <text x="57.8" y="29.2" text-anchor="middle" class="isvg" font-size="2.8">头部 0.8</text>
        </g>
        <g class="modeled-tail-copy">
          <rect class="modeled-tail" x="91.4" y="41" width="33.6" height="8" rx="1" fill="#DD8452"/>
          <text class="modeled-tail-value" x="102.6" y="46.2" text-anchor="middle" class="isvg" font-size="2.5">0.2</text>
        </g>
      </g></svg>
      <div class="ilabel rho iorange" style="left:80cqw;top:28cqh;font-size:1.75cqw">ρ = 0.2 / 0.3<br><b>= 2/3</b></div>
      <div class="ilabel scaled iorange" style="left:80cqw;top:47cqh;font-size:1.55cqw">模型尾部<br>ρ pᵥ</div>
      <div class="ieq tail-sum" style="left:9cqw;top:27cqh">Σ<tspan>ₜ</tspan> pᵥ sᵥ</div>
      <div class="ieq all-zero" style="left:9cqw;top:39cqh">Σ<tspan>全词表</tspan> pᵥ sᵥ = <b class="iteal">0</b></div>
      <div class="ieq reduce-arrow" style="left:36cqw;top:27cqh">→ <span class="iblue">− Σ<tspan>ₕ</tspan> pᵥ sᵥ</span></div>
      <div class="ieq final-head" style="left:9cqw;top:55cqh">E<tspan>q̂</tspan>[s] = Σ<tspan>ₕ</tspan> (qᵥ − ρ pᵥ) sᵥ</div>
      <div class="ilabel approx-title" style="left:10cqw;top:24cqh">相同尾部质量，内部比例可能不同</div>
      <svg class="layer" ${LAYER}><g class="approx-bars">
        <text x="17" y="35" class="isvg" font-size="2.8">真实 q 尾部</text><text x="88" y="35" class="isvg" font-size="2.8">重建 q̂ 尾部</text>
        ${[.10,.06,.03,.01].map((v,i)=>`<rect x="${18+i*13}" y="${61-v*180}" width="8" height="${v*180}" fill="#C65D4A" rx="0.5"/>`).join('')}
        ${[.08,.06,.04,.02].map((v,i)=>`<rect x="${89+i*13}" y="${61-v*180}" width="8" height="${v*180}" fill="#4C72B0" rx="0.5"/>`).join('')}
        <line class="iline" x1="15" y1="61" x2="72" y2="61"/><line class="iline" x1="86" y1="61" x2="143" y2="61"/>
      </g></svg>
      <div class="ieq residual icoral" style="left:13cqw;top:69cqh">残余均值 = Σ (qᵥ − q̂ᵥ) sᵥ</div>
      <div class="imeta">论文附录 A.1 · 质量与尾部形状为教学算例</div>
    `
    frame(root,CSS,brand('Score Centering')+`<div class="ititle">${title}</div>`+html)
    gsap.set(['.rho','.scaled','.qhat-track','.qhat-total','.qhat-head-copy','.modeled-tail-copy','.modeled-tail-value','.tail-sum','.all-zero','.reduce-arrow','.final-head','.approx-title','.approx-bars','.residual'],{autoAlpha:0})
    tl.fromTo('.qrow',{x:-7},{x:0,duration:.8,immediateRender:false},T(0,.08))
    tl.fromTo('.prow',{x:7},{x:0,duration:.8,immediateRender:false},T(0,.3))
    tl.to('.rho',{autoAlpha:1,duration:.5},T(1,.1))
    // Work on a copied tail so that the genuine trainer distribution remains unchanged.
    tl.to('.modeled-tail-copy',{autoAlpha:1,duration:.3},T(1,.23))
    tl.to('.modeled-tail',{attr:{width:22.4},duration:1.4,ease:'power2.inOut'},T(1,.27))
    tl.to('.modeled-tail-value',{autoAlpha:1,duration:.3},T(1,.36))
    tl.to('.scaled',{autoAlpha:1,duration:.4},T(1,.38))
    // Reconstruct a whole normalized distribution: the real q head and the modeled p tail.
    tl.to('.qhat-track',{autoAlpha:1,duration:.4},T(1,.44))
    tl.to('.qhat-head-copy',{autoAlpha:1,duration:.2},T(1,.48))
    tl.to('.qhat-head-copy',{y:34,duration:1.2,ease:'power2.inOut'},T(1,.5))
    tl.to('.modeled-tail-copy',{x:11.2,y:17,duration:1.2,ease:'power2.inOut'},T(1,.58))
    tl.to('.qhat-total',{autoAlpha:1,duration:.4},T(1,.68))
    // Start the algebra beside the still-visible reconstruction; then clear the two reference
    // rows only once the new mathematical representation has actually been established.
    tl.to('.mass-bars',{scale:.4,x:95,y:28,transformOrigin:'0 0',duration:.7,ease:'power2.inOut'},T(2))
    tl.to(['.rho','.scaled'],{autoAlpha:0,duration:.4},T(2))
    tl.to('.tail-sum',{autoAlpha:1,duration:.5},T(2,.02))
    tl.to('.all-zero',{autoAlpha:1,duration:.5},T(2,.2))
    tl.to('.mass-bars',{autoAlpha:0,duration:.5},T(2,.31))
    tl.to('.reduce-arrow',{autoAlpha:1,duration:.5},T(2,.42))
    tl.to('.final-head',{autoAlpha:1,duration:.5},T(2,.63))
    tl.to(['.tail-sum','.all-zero','.reduce-arrow','.final-head'],{autoAlpha:0,duration:.4},T(3))
    tl.to('.approx-title',{autoAlpha:1,duration:.5},T(3))
    tl.to('.approx-bars',{autoAlpha:1,duration:.6},T(3,.12))
    tl.to('.residual',{autoAlpha:1,duration:.5},T(3,.56))
    tl.set({}, {},T(4))
    return tl
  }
  if (page === 'loss') {
    html=`
      <div class="ieq full-loss" style="left:9cqw;top:23cqh">L = −R [ <span class="sample-term">log p<tspan>ᵧ</tspan></span> − <span class="center-term iblue">Σ sg[qᵥ] log pᵥ</span> ]</div>
      <svg class="layer" ${LAYER}>
        <g class="graph">
          <path d="M36 58 L36 44 L76 44" class="iline"/><path d="M119 58 L119 44 L84 44" class="iline"/>
          <rect x="16" y="58" width="40" height="10" rx="1.5" fill="var(--c-sunk)" stroke="var(--c-line-strong)" stroke-width="0.2"/>
          <rect x="96" y="58" width="46" height="10" rx="1.5" fill="var(--c-sunk)" stroke="var(--c-line-strong)" stroke-width="0.2"/>
          <text x="36" y="64.5" text-anchor="middle" class="isvg" font-size="2.8">log p<tspan baseline-shift="sub">y</tspan></text>
          <text x="119" y="64.5" text-anchor="middle" class="isvg" font-size="2.8">Σ q<tspan baseline-shift="sub">v</tspan> log p<tspan baseline-shift="sub">v</tspan></text>
          <circle cx="80" cy="44" r="5" fill="var(--c-surface)" stroke="#087F78" stroke-width="0.4"/><text x="80" y="45.3" text-anchor="middle" class="isvg" font-size="2.8">−</text>
          <path d="M80 39 L80 32" class="iline"/><text x="86" y="35" class="isvg" font-size="2.8">× (−R)</text>
        </g>
        <g class="detached"><path d="M135 48 L119 58" stroke="#C65D4A" stroke-width="0.5" stroke-dasharray="1 1" fill="none"/><rect x="132" y="40" width="21" height="8" rx="1" fill="var(--c-surface)" stroke="#C65D4A" stroke-width="0.3"/><text x="142.5" y="45.2" text-anchor="middle" class="isvg-small" font-size="2.1">sg[q<tspan baseline-shift="sub">v</tspan>]</text><line x1="123" y1="49" x2="132" y2="56" stroke="#C65D4A" stroke-width="0.8"/></g>
        <path class="back-sample iflow" d="M76 44 L36 44 L36 58"/>
        <path class="back-center iflow" d="M84 44 L119 44 L119 58"/>
      </svg>
      <div class="ilabel detach-label icoral" style="left:58cqw;top:37cqh">系数固定 · 保留 log p 的梯度</div>
      <div class="ieq gradient" style="left:12cqw;top:69cqh">−∇L = R (s<tspan>ᵧ</tspan> − <span class="iblue">Σ qᵥ sᵥ</span>)</div>
      <div class="imeta">论文附录 A.3 · 全词表损失</div>
    `
    frame(root,CSS,brand('Score Centering')+`<div class="ititle">${title}</div>`+html)
    gsap.set(['.center-term','.detached','.detach-label','.back-sample','.back-center','.gradient'],{autoAlpha:0})
    gsap.set(['.back-sample','.back-center'],{drawSVG:'0%'})
    tl.fromTo('.sample-term',{opacity:.3},{opacity:1,duration:.6,immediateRender:false},T(0,.08))
    tl.to('.center-term',{autoAlpha:1,duration:.6},T(0,.42))
    tl.to('.detached',{autoAlpha:1,duration:.5},T(1,.18))
    tl.to('.detach-label',{autoAlpha:1,duration:.5},T(1,.43))
    tl.to(['.back-sample','.back-center'],{autoAlpha:1,duration:.01},T(2,.08))
    tl.to('.back-sample',{drawSVG:'100%',duration:1.2},T(2,.12))
    tl.to('.back-center',{drawSVG:'100%',duration:1.2},T(2,.3))
    tl.to('.gradient',{autoAlpha:1,duration:.6},T(2,.59))
    tl.set({}, {},T(3))
    return tl
  }
  // Code keeps its line identities throughout all four states. Names are the paper's names;
  // the paper's jnp.exp prefix is abbreviated to exp only to avoid horizontal scrolling.
  const lines=minimalCode.map((line,i)=>`<div class="code-line cl${i}"><span class="ln">${i+1}</span><code>${escape(line)}</code></div>`).join('')
  html=`
    <div class="code-panel">${lines}</div>
    <div class="code-focus"></div>
    <div class="calc-label inputs-label">同一前缀</div>
    <div class="calc inputs-value"><span class="iblue">q<tspan>ₕ</tspan> = 0.8</span><br>p<tspan>ₕ</tspan> = 0.7</div>
    <div class="calc-label rho-label">尾部比例</div>
    <div class="calc rho-value iorange">(1 − 0.8)<br>────────<br>(1 − 0.7)<br><b>= 2/3</b></div>
    <div class="calc-label res-label">头部系数</div>
    <div class="calc res-value iblue">qᵥ − ρpᵥ</div>
    <div class="calc-label corr-label">停止梯度后点积</div>
    <div class="calc corr-value">sg[系数]<br>· log p<tspan>ₕ</tspan></div>
    <div class="calc-label ret-label">样本更新</div>
    <div class="calc ret-value iteal">−R ×<br>(log p<tspan>ᵧ</tspan><br>− 修正项)</div>
    <div class="imeta">论文 §4.1 · exp 为 jnp.exp · 教学示意数据</div>
  `
  frame(root,CSS+`
    .code-panel { position:absolute;left:6cqw;top:23cqh;width:66cqw;z-index:1; }
    .code-line { display:flex;align-items:baseline;gap:1cqw;height:4.1cqh;white-space:pre;font-family:var(--pm-font-mono);font-size:1.42cqw; }
    .code-line code { font:inherit; } .ln { color:var(--c-muted);width:2cqw;text-align:right;flex:none;font-size:1.2cqw; }
    .code-focus { position:absolute;left:5.5cqw;top:22.6cqh;width:67cqw;height:8.2cqh;border-radius:0.5cqw;background:var(--c-accent-soft);border-left:0.35cqw solid var(--c-accent); }
    .calc-label { position:absolute;left:76cqw;top:27cqh;width:21cqw;font-size:1.6cqw;font-weight:700; }
    .calc { position:absolute;left:76cqw;top:35cqh;width:21cqw;font-size:2.3cqw;font-family:var(--pm-font-mono);line-height:1.35; }
  `,brand('Score Centering')+`<div class="ititle">${title}</div>`+html)
  gsap.set(['.rho-label','.rho-value','.res-label','.res-value','.corr-label','.corr-value','.ret-label','.ret-value'],{autoAlpha:0})
  gsap.set('.code-focus',{top:'22.6cqh',height:'12.3cqh'})
  tl.fromTo('.inputs-value',{x:15,autoAlpha:0},{x:0,autoAlpha:1,duration:.8,immediateRender:false},T(0,.18))
  tl.to('.code-focus',{top:'34.9cqh',height:'8.2cqh',duration:.7,ease:'power2.inOut'},T(1))
  tl.to(['.inputs-label','.inputs-value'],{autoAlpha:0,duration:.35},T(1))
  tl.to(['.rho-label','.rho-value'],{autoAlpha:1,duration:.5},T(1,.2))
  tl.to('.code-focus',{top:'43.1cqh',height:'8.2cqh',duration:.7,ease:'power2.inOut'},T(2))
  tl.to(['.rho-label','.rho-value'],{autoAlpha:0,duration:.35},T(2))
  tl.to(['.res-label','.res-value'],{autoAlpha:1,duration:.5},T(2,.17))
  tl.to('.code-focus',{top:'51.3cqh',height:'8.2cqh',duration:.7,ease:'power2.inOut'},T(2,.46))
  tl.to(['.res-label','.res-value'],{autoAlpha:0,duration:.35},T(2,.46))
  tl.to(['.corr-label','.corr-value'],{autoAlpha:1,duration:.5},T(2,.54))
  tl.to('.code-focus',{top:'59.5cqh',height:'8.2cqh',duration:.7,ease:'power2.inOut'},T(3))
  tl.to(['.corr-label','.corr-value'],{autoAlpha:0,duration:.35},T(3))
  tl.to(['.ret-label','.ret-value'],{autoAlpha:1,duration:.5},T(3,.23))
  tl.set({}, {},T(4))
  return tl
})
