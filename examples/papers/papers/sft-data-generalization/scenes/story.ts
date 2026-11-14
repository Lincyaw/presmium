import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, frame, TYPE } from '../../../kit/frame.ts'
import { C, svg, tx, path, rect, trace, escape } from './visual.ts'
import type { Shot } from './visual.ts'
import { renderEvidence } from './evidence.ts'

function question(s: Shot) {
  let a = rect(9,37,23,21) + tx('同一道题',20.5,49,3.2);
  a += path(32,47,55,34,C.line) + path(32,48,55,58,C.line);
  a += rect(55,25,38,16) + tx(s.id === 'puzzle' ? 'SFT' : s.labels[0]!,74,35,3.4);
  a += rect(55,49,38,16) + tx(s.id === 'puzzle' ? 'RL' : s.labels[2]!,74,59,3.4);
  if(s.id === 'puzzle') {
    a += trace(104,26,C.orange);
    for(let i=0;i<8;i++) a += trace(104+i*5.5,50,C.muted,i?'new-trace':'');
    a += tx('解题轨迹',125,72,2.6,C.muted);
  } else {
    a += tx(s.labels[1]!,120,35,2.7) + tx('生成解答',112,55,2.8) + tx('结果奖励更新',123,64,2.7);
    a += tx(s.labels[4]!,80,72,2.5,C.muted);
  }
  return svg(a)
}
function setup(s: Shot) {
  return svg(rect(8,34,36,23) + tx(s.labels[0]!,26,43,3.1) + tx(s.labels[1]!,26,51,3.0,C.orange) +
    path(44,45,62,45,C.line,'ink-path') + rect(62,34,31,23) + tx('训练后的模型',77.5,47,3.2) +
    path(93,45,111,45,C.line,'ink-path') + rect(111,31,41,29) + tx(s.labels[2]!,131.5,41,3.2) + tx(s.labels[3]!,131.5,51,2.4) +
    tx(s.labels[4]!,109,70,3.0,C.muted))
}
function sources(s: Shot) {
  let a=rect(7,29,42,15,C.surface,'',C.blue)+tx(s.labels[0]!,28,38,3.1,C.blue);
  a+=rect(7,53,42,15,C.surface,'',C.orange)+tx(s.labels[1]!,28,62,3.1,C.orange);
  a+=path(49,36,69,47,C.blue,'ink-path')+path(49,60,69,47,C.orange,'ink-path')+rect(69,38,36,20)+tx('SFT',87,47,4)+tx('同一底座',87,54,2.7);
  const values=s.values!;
  a+=tx(values[0]!.toFixed(1),129,34,5.6,C.blue,'middle','reveal')+tx(values[1]!.toFixed(1),129,51,5.6,C.orange,'middle','reveal')+tx(values[2]!.toFixed(1),129,68,5.6,C.ink,'middle','reveal');
  a+=tx('两种来源混合',87,69,2.5,C.muted);
  return svg(a)
}
function budget(s: Shot) {
  let a=tx('SFT',16,38,4.4)+tx('RL',16,62,4.4,C.pink);
  if(s.mode==='prompt'){
    a+=trace(43,25,C.orange);
    for(let i=0;i<8;i++)a+=trace(43+i*11,49,C.muted,i?'new-trace':'');
    a+=tx(s.labels[1]!,85,44,2.9,C.orange)+tx(s.labels[2]!,85,70,2.9,C.pink)+tx(s.labels[3]!,127,28,2.8,C.pink);
  } else if(s.mode==='correct'){
    a+=rect(35,27,112,16,C.surface);
    for(let i=0;i<14;i++)a+=rect(37+i*7.8,29,6.2,12,C.orange,i>3?'new-trace':'',C.orange);
    a+=tx('39,623 条正确轨迹',91,24,3.9,C.orange)+tx(s.labels[3]!,91,71,4.0);
    a+=rect(35,52,112,11,C.surface); for(let i=0;i<14;i++)a+=rect(37+i*7.8,54,6.2,7,C.pink,'',C.pink);
  } else {
    const w=112,correct=w*s.values![0]!/s.values![2]!;
    a+=rect(35,26,w,19,C.surface)+rect(35,26,correct,19,C.orange,'',C.orange)+rect(35+correct,26,w-correct,19,'var(--pm-color-line)','new-trace','var(--pm-color-line)');
    a+=tx(s.labels[0]!,52,53,2.8,C.orange)+tx(s.labels[1]!,111,53,2.8,C.muted);
    a+=tx('138,264',91,69,7.2,C.ink,'middle','reveal')+tx('条训练轨迹',91,74,2.4,C.muted);
    a+=path(35,58,145,58,C.pink);
  }
  return svg(a)
}
export default gsapScene(ctx=>{
  const shots=ctx.parameters.frames as unknown as Shot[];
  const index=Math.max(0,shots.findIndex(s=>s.id===ctx.state)),s=shots[index]!;
  let art='';
  if(s.kind==='puzzle'||s.kind==='definitions')art=question(s);
  else if(s.kind==='setup')art=setup(s);
  else if(s.kind==='sources')art=sources(s);
  else if(s.kind==='budget')art=budget(s);
  else art=renderEvidence(s);
  frame(ctx.root,`
    .heading{position:absolute;left:5cqw;top:11cqh;right:4cqw;font-size:3.35cqw;font-weight:800;line-height:1.18}
    .source{position:absolute;left:5cqw;top:75cqh;right:4cqw;font-size:1.15cqw;color:var(--pm-color-muted);white-space:nowrap}
    .paper-figure{position:absolute;left:4cqw;top:24cqh;width:67cqw;height:49cqh;display:flex;align-items:center;justify-content:center}
    .paper-figure img{width:100%;height:100%;object-fit:contain}
    .figure-notes{position:absolute;left:73cqw;top:27cqh;width:23cqw;display:flex;flex-direction:column;gap:3cqh}
    .figure-note{font-size:1.75cqw;font-weight:650;line-height:1.35}
    .figure-note:nth-child(2){font-size:2.35cqw;color:${C.orange}}
    .figure-note:nth-child(3){color:${C.pink}}
    .figure-note strong{font-size:3.1cqw}
  `,brand('SFT Data')+'<div class="heading">'+escape(s.title)+'</div>'+art+'<div class="source">'+escape(s.source)+'</div>');
  const {gsap,root}=ctx,tl=gsap.timeline();
  const T=(f:number)=>(ctx.at(index)+ctx.durations[index]!*f)/1000;
  const paths=[...root.querySelectorAll<SVGPathElement>('.ink-path')];
  for(const p of paths){const length=p.getTotalLength();gsap.set(p,{strokeDasharray:length,strokeDashoffset:length});tl.to(p,{strokeDashoffset:0,duration:0.65,ease:'power2.out'},T(0.12));}
  const traces=root.querySelectorAll('.new-trace');
  if(traces.length){gsap.set(traces,{autoAlpha:0});tl.to(traces,{autoAlpha:1,stagger:0.05,duration:0.25},T(0.25));}
  const methods=root.querySelectorAll('.new-method');
  if(methods.length){gsap.set(methods,{autoAlpha:0});tl.to(methods,{autoAlpha:1,stagger:0.016,duration:0.2},T(0.56));}
  const reveals=root.querySelectorAll('.reveal');
  if(reveals.length){gsap.set(reveals,{autoAlpha:0,y:7});tl.to(reveals,{autoAlpha:1,y:0,stagger:0.18,duration:0.4},T(0.33));}
  const bars=root.querySelectorAll('.grow');
  if(bars.length){gsap.set(bars,{scaleY:0,transformOrigin:'50% 100%'});tl.to(bars,{scaleY:1,duration:0.7,ease:'power2.out'},T(0.18));}
  tl.set({}, {},ctx.total/1000);return tl
})
