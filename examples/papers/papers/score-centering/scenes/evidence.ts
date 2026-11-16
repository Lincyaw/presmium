import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'

type Region = { x: number; y: number; w: number; h: number }
const WHOLE: Region = { x: 0, y: 0, w: 1, h: 1 }
const FIGURES = {
  study: { src: new URL('../figures/online-offline.png', import.meta.url).href, aspect: 2.77778, source: '论文图 2 · 留出评测准确率 · 阴影 ±1 标准误' },
  noise: { src: new URL('../figures/weight-noise.png', import.meta.url).href, aspect: 3.33333, source: '论文图 3 · 留出评测准确率 · 阴影 ±1 标准误' },
  quant: { src: new URL('../figures/quant-stale.png', import.meta.url).href, aspect: 3.10345, source: '论文图 4 · 训练准确率 · 阴影 ±1 标准误' },
  stale: { src: new URL('../figures/quant-stale.png', import.meta.url).href, aspect: 3.10345, source: '论文图 4 · 训练准确率 · 每 64 步同步一次' },
  scale: { src: new URL('../figures/30b-math.png', import.meta.url).href, aspect: 3, source: '论文图 1、§5.4 · 训练准确率 · 阴影 ±1 标准误' },
  ablation: { src: new URL('../figures/topk.png', import.meta.url).href, aspect: 1.25, source: '论文图 5、附录 A.4、B.3 · 训练准确率 · 种子见图例' },
}
type FigurePage = keyof typeof FIGURES
const SC = '#4C72B0', TIS = '#DD8452', PG = '#55A868'
const CSS = `
  .e-title { position:absolute; left:5cqw; top:10cqh; font-size:3.1cqw; font-weight:800; line-height:1.2; }
  .e-sub { position:absolute; left:5cqw; top:17cqh; font-size:1.55cqw; color:var(--c-muted); }
  .paper-window { position:absolute; left:4cqw; top:22cqh; width:64cqw; height:29cqw; overflow:hidden; background:white; border-radius:.7cqw; box-shadow:0 0 0 .12cqw var(--c-line-strong); }
  .paper-mask { position:absolute; overflow:hidden; }
  .paper-cam { position:absolute; transform-origin:0 0; }
  .paper-cam img { display:block; width:100%; height:100%; }
  .focus { position:absolute; border:.22cqw solid ${SC}; border-radius:.35cqw; pointer-events:none; }
  .scan { position:absolute; top:8%; height:76%; width:.12cqw; background:${TIS}; transform-origin:0 100%; }
  .source { position:absolute; left:5cqw; top:75cqh; font-size:1.1cqw; white-space:nowrap; color:var(--c-muted); }
  .side { position:absolute; left:72cqw; top:23cqh; width:24cqw; }
  .side .tag { display:block; font-size:1.5cqw; color:var(--c-muted); margin-bottom:1.3cqh; }
  .side strong { display:block; font-size:2.65cqw; line-height:1.3; color:var(--c-ink); font-weight:800; }
  .side .detail { display:block; margin-top:2.2cqh; font-size:1.7cqw; line-height:1.6; }
  .side .value { display:block; font-size:4.2cqw; font-weight:800; color:${SC}; margin-top:2cqh; }
  .step-count .value { font-size:2.6cqw; white-space:nowrap; }
  .side .value.orange { color:${TIS}; }
  .side .mini { display:block; font-size:1.4cqw; color:var(--c-muted); margin-top:1.5cqh; line-height:1.5; }
  .side .line { height:.16cqw; background:var(--c-line-strong); margin:2.6cqh 0; }
  .side .success { color:${SC}; }
  .diagram { position:absolute; inset:0; transform:translateY(-3cqh); }
  
  .diagram .label { font-weight:750; }
  .diagram .small { fill:var(--c-muted); }
  .diagram .node { fill:var(--c-surface); stroke:var(--c-line-strong); stroke-width:.25; }
  .diagram .blue { fill:${SC}; }
  .diagram .wire { fill:none; stroke:var(--c-line-strong); stroke-width:.38; }
  .diagram .wire.active { stroke:${SC}; stroke-width:.65; }
  .diagram .token { fill:${SC}; stroke:var(--c-surface); stroke-width:.25; }
  .controls { position:absolute; left:7cqw; top:25cqh; width:85cqw; }
  .control-lane { display:flex; gap:2.2cqw; align-items:center; margin-bottom:6cqh; }
  .control-label { width:17cqw; font-size:2.3cqw; font-weight:750; }
  .control-bar { position:relative; width:47cqw; height:2cqh; background:var(--c-line); border-radius:1cqw; }
  .control-tick { position:absolute; height:4cqh; top:-1cqh; width:.3cqw; background:${SC}; }
  .control-value { font-size:1.7cqw; white-space:nowrap; }
  .one { position:absolute; left:48cqw; top:60cqh; font-size:2.2cqw; font-weight:750; }
  .sync-ruler { position:absolute; left:8cqw; top:18cqh; width:55cqw; height:3cqh; border-bottom:.15cqw solid var(--c-line-strong); }
  .sync-ruler i { position:absolute; bottom:-.65cqh; height:1.3cqh; width:.18cqw; background:var(--c-line-strong); }
  .sync-ruler .sync-now { position:absolute; left:0; top:-.3cqh; height:2.5cqh; width:.6cqw; border-radius:.3cqw; background:${SC}; }
  .sync-ruler span { position:absolute; top:-2.2cqh; font-size:1.2cqw; color:var(--c-muted); }
  .callout { position:absolute; left:72cqw; top:57cqh; width:24cqw; font-size:2cqw; font-weight:750; color:${SC}; line-height:1.5; }
  .cost { position:absolute; left:13cqw; top:28cqh; width:47cqw; }
  .cost-row { display:flex; align-items:center; gap:1.5cqw; margin:4cqh 0; font-size:1.6cqw; }
  .cost-label { width:10cqw; }
  .cost-track { position:relative; width:31cqw; height:2.2cqh; background:var(--c-line); border-radius:.4cqw; }
  .cost-fill { height:100%; background:${SC}; border-radius:.4cqw; transform-origin:0 50%; }
  .cost-extra { position:absolute; top:0; left:99%; height:100%; width:1%; background:${TIS}; }
  .cost-number { position:absolute; left:14cqw; top:57cqh; font-size:4.6cqw; font-weight:800; color:${SC}; }
  .cost-note { position:absolute; left:14cqw; top:68cqh; font-size:1.7cqw; color:var(--c-muted); }
  .condition { position:absolute; left:8cqw; top:68cqh; font-size:1.4cqw; color:var(--c-muted); }
`

function line(x1: number,y1: number,x2: number,y2: number,cls = '') {
  const d = 'M'+x1+' '+y1+' L'+x2+' '+y2
  const dx=x2-x1,dy=y2-y1,n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n
  const p=(x2-ux*1.8+uy*.8)+','+(y2-uy*1.8-ux*.8)+' '+x2+','+y2+' '+(x2-ux*1.8-uy*.8)+','+(y2-uy*1.8+ux*.8)
  return '<g class="'+cls+'"><path class="wire" d="'+d+'"/><polyline fill="none" stroke="var(--c-line-strong)" stroke-width=".38" points="'+p+'"/></g>'
}
function side(cls:string,tag:string,head:string,detail:string,value='',mini='') {
  return '<div class="side '+cls+'"><span class="tag">'+tag+'</span><strong>'+head+'</strong><span class="detail">'+detail+'</span>'+(value?'<span class="value">'+value+'</span>':'')+(mini?'<span class="mini">'+mini+'</span>':'')+'</div>'
}
/** Fit a source rectangle without distorting its axes, retaining the original image and overlay identities. */
function camera(r:Region,aspect:number) {
  const W=64,H=29, cropAspect=aspect*r.w/r.h
  const cw=Math.min(W,H*cropAspect),ch=cw/cropAspect,iw=cw/r.w,ih=iw/aspect
  return { mask: {left:(W-cw)/2+'cqw',top:(H-ch)/2+'cqw',width:cw+'cqw',height:ch+'cqw'}, image: {left:-r.x*iw+'cqw',top:-r.y*ih+'cqw',width:iw+'cqw',height:ih+'cqw'} }
}

export default gsapScene(({root,gsap,at,durations,parameters})=>{
  const {T}=clock(at,durations)
  const page=String(parameters.page??'study')
  const title=escape(String(parameters.title??''))
  const tl=gsap.timeline()
  const header=brand('Score Centering')+'<div class="e-title">'+title+'</div>'
  if(page==='practice') {
    const nodes=[
      '<g class="p-trainer"><rect class="node" x="10" y="25" width="30" height="13" rx="2"/><text font-size="2.7" class="label" x="25" y="31" text-anchor="middle">训练器 p</text><text font-size="1.85" class="small" x="25" y="35" text-anchor="middle">当前权重</text></g>',
      '<g class="p-sampler"><rect class="node" x="111" y="25" width="34" height="13" rx="2"/><text font-size="2.7" class="label" x="128" y="31" text-anchor="middle">采样器 q</text><text font-size="1.85" class="small" x="128" y="35" text-anchor="middle">量化 / 旧权重</text></g>',
      '<g class="p-log"><rect class="node" x="104" y="49" width="46" height="14" rx="2"/><text font-size="2.7" class="label" x="127" y="55" text-anchor="middle">记录 token 概率</text><text font-size="1.85" class="small" x="127" y="59.5" text-anchor="middle">top-k ids / logp / sampled logp</text></g>',
      '<g class="p-loss"><rect class="node" x="46" y="49" width="47" height="14" rx="2"/><text font-size="2.7" class="label" x="69.5" y="55" text-anchor="middle">sg[系数] × log p</text><text font-size="1.85" class="small" x="69.5" y="59.5" text-anchor="middle">尾部重建 → 中心化损失</text></g>',
      '<g class="p-monitor"><rect class="node" x="5" y="49" width="31" height="14" rx="2"/><text font-size="2.7" class="label" x="20.5" y="55" text-anchor="middle">验证更新</text><text font-size="1.85" class="small" x="20.5" y="59.5" text-anchor="middle">漂移 / 熵 / 奖励</text></g>'
    ].join('')
    const wires=line(40,31,111,31,'p-sync')+line(128,38,128,49,'p-down')+line(104,56,93,56,'p-left1')+line(46,56,36,56,'p-left2')+line(20,49,20,38,'p-up')
    const choice='<g class="p-choice"><text font-size="2.7" x="75" y="19" text-anchor="middle" class="label">数值不一致 → SC</text><text font-size="1.85" x="75" y="24" text-anchor="middle" class="small">明显滞后 → TIS / MIS + SC</text></g>'
    const formula='<g class="p-check"><text font-size="2.7" x="80" y="44" text-anchor="middle" class="label">恒定奖励：平均更新 ≈ 0</text></g>'
    frame(root,CSS,header+'<svg class="layer diagram" '+LAYER+'>'+wires+nodes+choice+formula+'<circle class="flow-token token" cx="128" cy="40" r="1.4"/><circle class="flow-update token" cx="102" cy="56" r="1.4"/></svg><div class="condition">目标系统验证：尾部覆盖率 · 同步周期 · 长上下文 · 实际吞吐</div>')
    gsap.set(['.p-loss','.p-monitor','.p-choice','.p-check','.p-left1','.p-left2','.p-up','.flow-update','.condition'],{autoAlpha:0})
    tl.fromTo('.flow-token',{attr:{cy:40}},{attr:{cy:48},duration:1,ease:'power1.inOut',immediateRender:false},T(0,.23))
    tl.to('.p-log .node',{stroke:SC,duration:.4},T(0,.38))
    tl.to('.flow-token',{autoAlpha:0,duration:.25},T(0,.4))
    tl.to('.p-choice',{autoAlpha:1,duration:.5},T(1,.07))
    tl.to(['.p-left1','.p-loss','.flow-update'],{autoAlpha:1,duration:.5},T(1,.25))
    tl.to('.flow-update',{attr:{cx:94},duration:1,ease:'power1.inOut'},T(1,.32))
    tl.to('.flow-update',{autoAlpha:0,duration:.25},T(1,.43))
    tl.to('.p-loss .node',{stroke:SC,duration:.5},T(1,.49))
    tl.to(['.p-left2','.p-monitor','.p-up'],{autoAlpha:1,duration:.4},T(2,.04))
    tl.set('.flow-update',{attr:{cx:44,cy:56},autoAlpha:1},T(2,.1))
    tl.to('.flow-update',{attr:{cx:20.5},duration:.7},T(2,.12))
    tl.to('.flow-update',{attr:{cy:31},duration:.6},T(2,.25))
    tl.to('.flow-update',{autoAlpha:0,duration:.3},T(2,.32))
    tl.to('.p-trainer .node',{stroke:SC,duration:.4},T(2,.32))
    tl.to('.p-check',{autoAlpha:1,duration:.5},T(2,.38))
    tl.to('.condition',{autoAlpha:1,duration:.5},T(2,.64))
    tl.set({}, {}, T(3)); return tl
  }
  if(!(page in FIGURES)) throw new Error('Unknown evidence page: '+page)
  const fig=FIGURES[page as FigurePage]
  const extra:Record<string,string> = {
    study: '<div class="controls"><div class="control-lane"><span class="control-label">目标函数</span><div class="control-bar"><i class="control-tick c0" style="left:10%"></i></div><span class="control-value">同一 REINFORCE</span></div><div class="control-lane"><span class="control-label">优势与采样</span><div class="control-bar"><i class="control-tick c1" style="left:45%"></i></div><span class="control-value">保持一致</span></div><div class="control-lane"><span class="control-label">优化器</span><div class="control-bar"><i class="control-tick c2" style="left:80%"></i></div><span class="control-value">SGD · 每批一步</span></div></div><div class="one">仅替换修正规则</div>'+side('s1','图 2 · 离线','固定数据','+1 / 0<br>相对稳定','','Qwen3-1.7B · Countdown')+side('s2','图 2 · 在线 + TIM','不断同步','组中心化<br>相对稳定','','+1 / 0 最不稳定'),
    noise: side('s0','Qwen3-0.6B · Countdown','受控权重偏移','横轴：训练步<br>纵轴：留出评测准确率','','固定 Δθ · 3 个种子')+side('s1','由弱到强','0.01 → 0.05','SC<br>TIS + SC<br>MIS + SC','','强偏移下保持稳定')+side('s2 step-count','DPPO · 正文近似','崩溃步数','弱 → 中 → 强','160 → 80 → 20','§5.2 · 非误差规模实测'),
    quant: side('s0','量化不一致','训练 bf16','采样 INT8<br>权重 / 激活 / KV','','Qwen3-0.6B · Countdown')+side('s1','相同训练设置','跟踪 SC','再比较 TIS + SC<br>与 MIS + SC','','纵轴：训练准确率')+side('s2','量化压力设置','SC 与组合','保持稳定<br>表现最好','','阴影：±1 标准误'),
    stale: '<div class="sync-ruler">'+Array.from({length:9},(_,i)=>'<i style="left:'+(i*12.5)+'%"></i>').join('')+'<span style="left:0">0</span><span style="left:48%">32</span><span style="left:96%">64</span><b class="sync-now"></b></div>'+side('s0','固定同步周期','每 64 步','采样器保持旧权重<br>训练器持续更新','','Qwen3-0.6B · Countdown')+side('s1','图 4 · 右','组合更好','TIS + SC<br>MIS + SC','','相对单独 SC')+side('s2','回到更新分解','权重 + 去均值','IS：调整分布<br>SC：去残余漂移','','信号仍按 q 计算'),
    scale: side('s0','Qwen3-30B-A3B-Base','INTELLECT-2 数学','MoE · 未回放路由<br>三个量化强度','','纵轴：训练准确率')+side('s1','FP8 W/A + FP8 KV','轻量化设置','普通 PG 也稳定','58%','800 步 · 与修正方法相近')+side('s2','FP8 W/A + FP4 KV','SC / TIS','PG：200 步内崩溃','52% / 51%','MIS：后期崩溃')+side('s3','INT8 W/A + INT4 KV','SC / TIS','其他方法：结束 <5%','30% / 12%','严重不一致 · 训练准确率'),
    ablation: side('s0','图 5 · 逐面板比较','32 / 128 / full','头部近似<br>与完整词表相当','','限于论文所测设置')+side('s1','同硬件 · 自定义 JAX','额外墙钟时间','k = 128','< 1%','vLLM / SGLang 开销未测')+side('s2','附录 B.3','按曲线读种子数','小模型主要比较：3<br>30B：1–5','','部分 top-k 消融：1 个种子')+'<div class="cost"><div class="cost-row"><span class="cost-label">基线</span><div class="cost-track"><div class="cost-fill" style="width:99%"></div></div></div><div class="cost-row"><span class="cost-label">SC · 128</span><div class="cost-track"><div class="cost-fill full" style="width:99%"></div><div class="cost-extra"></div></div></div></div><div class="cost-number">+ &lt;1%</div><div class="cost-note">0.6B 与 30B · 论文自定义 JAX 采样器</div>',
  }
  frame(root,CSS,header+'<div class="paper-window"><div class="paper-mask"><div class="paper-cam"><img src="'+fig.src+'" alt="'+fig.source+'"><div class="focus"></div><div class="scan"></div></div></div></div><div class="source">'+fig.source+'</div>'+extra[page])
  const pose=(r:Region,k:number,f=0,duration=.8)=>{ const c=camera(r,fig.aspect); tl.to('.paper-mask',{...c.mask,duration,ease:'power2.inOut'},T(k,f)); return tl.to('.paper-cam',{...c.image,duration,ease:'power2.inOut'},T(k,f)) }
  const setPose=(r:Region)=>{ const c=camera(r,fig.aspect); gsap.set('.paper-mask',c.mask); gsap.set('.paper-cam',c.image) }
  const note=(cls:string,k:number,f=.12)=>tl.to(cls,{autoAlpha:1,duration:.4},T(k,f))
  const swap=(old:string,next:string,k:number,f=0)=>{tl.to(old,{autoAlpha:0,duration:.28},T(k));note(next,k,f)}
  const ring=(r:Region,k:number,f=.2)=>{tl.to('.focus',{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%',autoAlpha:1,duration:.6,ease:'power2.inOut'},T(k,f))}
  const scan=(x0:number,x1:number,k:number,f=.24,end=.65)=>{tl.set('.scan',{left:x0*100+'%',autoAlpha:1},T(k,f));tl.to('.scan',{left:x1*100+'%',duration:T(k,end)-T(k,f),ease:'none'},T(k,f));tl.to('.scan',{autoAlpha:0,duration:.3},T(k,end))}
  setPose(WHOLE)
  gsap.set(['.focus','.scan','.side','.side .value'],{autoAlpha:0})
  gsap.set('.focus',{left:'0%',top:'0%',width:'100%',height:'100%'})
  if(page==='study') {
    gsap.set(['.paper-window','.source','.one'],{autoAlpha:0})
    gsap.set('.control-tick',{scaleY:0,transformOrigin:'50% 50%'})
    tl.to('.control-tick',{scaleY:1,duration:.5,stagger:.4},T(0,.16))
    tl.to('.one',{autoAlpha:1,duration:.4},T(0,.6))
    tl.to(['.controls','.one'],{autoAlpha:0,duration:.4},T(1))
    tl.to(['.paper-window','.source'],{autoAlpha:1,duration:.4},T(1))
    pose({x:0,y:0,w:.525,h:1},1,.2)
    note('.s1',1,.18)
    ring({x:.22,y:.25,w:.14,h:.12},1,.5)
    pose({x:.525,y:0,w:.475,h:1},2,.05)
    swap('.s1','.s2',2,.15)
    ring({x:.66,y:.16,w:.16,h:.14},2,.4)
    scan(.55,.96,2,.42,.75)
    tl.set({}, {}, T(3))
  } else if(page==='noise') {
    note('.s0',0,0)
    ring({x:.01,y:.06,w:.272,h:.9},0,.18)
    scan(.064,.28,0,.3,.63)
    swap('.s0','.s1',1,.1)
    pose({x:0,y:0,w:.365,h:1},1,.06)
    ring({x:.065,y:.17,w:.215,h:.11},1,.2)
    pose({x:.68,y:0,w:.32,h:1},1,.49)
    ring({x:.69,y:.16,w:.225,h:.19},1,.6)
    pose(WHOLE,2,.02)
    swap('.s1','.s2',2,.28)
    note('.s2 .value',2,.61)
    ring({x:.15,y:.48,w:.05,h:.22},2,.21)
    ring({x:.42,y:.45,w:.05,h:.26},2,.42)
    ring({x:.70,y:.45,w:.05,h:.26},2,.62)
    tl.set({}, {}, T(3))
  } else if(page==='quant') {
    setPose({x:0,y:0,w:.5,h:1})
    note('.s0',0,0)
    ring({x:.15,y:0,w:.265,h:.065},0,.38)
    swap('.s0','.s1',1,.1)
    ring({x:.06,y:.15,w:.345,h:.17},1,.22)
    scan(.064,.408,1,.3,.7)
    swap('.s1','.s2',2,.3)
    ring({x:.41,y:.12,w:.09,h:.2},2,.12)
    tl.set({}, {}, T(3))
  } else if(page==='stale') {
    setPose({x:.52,y:0,w:.48,h:1})
    note('.s0',0,0)
    tl.to('.sync-now',{left:'100%',duration:T(0,.63)-T(0,.17),ease:'none'},T(0,.17))
    tl.fromTo('.sync-now',{scale:1},{scale:1.8,duration:.35,repeat:1,yoyo:true,immediateRender:false},T(0,.65))
    swap('.s0','.s1',1,.06)
    ring({x:.54,y:.12,w:.34,h:.13},1,.17)
    scan(.54,.88,1,.25,.7)
    swap('.s1','.s2',2,.25)
    ring({x:.89,y:.11,w:.108,h:.13},2,.16)
    tl.set({}, {}, T(3))
  } else if(page==='scale') {
    note('.s0',0,0)
    ring({x:.06,y:0,w:.92,h:.07},0,.4)
    pose({x:0,y:0,w:.343,h:1},1,.08)
    swap('.s0','.s1',1,.17)
    note('.s1 .value',1,.52)
    ring({x:.20,y:.07,w:.13,h:.17},1,.35)
    scan(.065,.327,1,.41,.75)
    pose({x:.342,y:0,w:.326,h:1},2,.04)
    swap('.s1','.s2',2,.2)
    note('.s2 .value',2,.62)
    ring({x:.49,y:.08,w:.17,h:.22},2,.4)
    pose({x:.67,y:0,w:.33,h:1},3,.03)
    swap('.s2','.s3',3,.25)
    note('.s3 .value',3,.47)
    ring({x:.88,y:.21,w:.108,h:.33},3,.42)
    tl.set({}, {}, T(4))
  } else {
    setPose({x:0,y:0,w:.335,h:.325})
    gsap.set(['.cost','.cost-number','.cost-note'],{autoAlpha:0})
    note('.s0',0,0)
    ring({x:.185,y:.20,w:.14,h:.08},0,.18)
    pose({x:.333,y:.326,w:.335,h:.325},0,.34)
    ring({x:.51,y:.53,w:.14,h:.08},0,.44)
    pose({x:.666,y:.653,w:.334,h:.347},0,.62)
    ring({x:.84,y:.85,w:.15,h:.09},0,.74)
    tl.to('.paper-window',{autoAlpha:.12,duration:.4},T(1,.21))
    swap('.s0','.s1',1,.1)
    tl.to('.cost',{autoAlpha:1,duration:.4},T(1,.04))
    tl.fromTo('.cost-fill',{scaleX:0},{scaleX:1,duration:1,stagger:.15,immediateRender:false},T(1,.2))
    tl.to('.cost-number',{autoAlpha:1,duration:.4},T(1,.47))
    note('.s1 .value',1,.47)
    tl.to('.cost-note',{autoAlpha:1,duration:.4},T(1,.62))
    tl.to(['.cost','.cost-number','.cost-note'],{autoAlpha:0,duration:.3},T(2))
    tl.to('.paper-window',{autoAlpha:1,duration:.4},T(2))
    swap('.s1','.s2',2,.1)
    pose({x:.333,y:.653,w:.335,h:.347},2,.06)
    ring({x:.548,y:.85,w:.115,h:.09},2,.3)
    pose({x:.666,y:.653,w:.334,h:.347},2,.5)
    ring({x:.875,y:.85,w:.115,h:.09},2,.65)
    tl.set({}, {}, T(3))
  }
  return tl
})
