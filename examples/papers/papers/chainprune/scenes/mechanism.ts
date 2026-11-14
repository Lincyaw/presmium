import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'
import { FIGURE_CSS, figureHtml, view } from '../../../kit/figure.ts'
import figureMap from '../figures/pipeline.json'
import type { FigureMap } from '../../../kit/figure.ts'
export default gsapScene(ctx=>{
 const {root,gsap,parameters:p,at,durations}=ctx,{T}=clock(at,durations);
 const labels=p.labels as string[],heads=p.heads as string[],mode=String(p.mode);
 const l=(i:number)=>escape(labels[i]??'');
 const C={blue:'#7b9ccc',red:'#c6534e',green:'#309a59',yellow:'#d9ac3f',muted:'var(--c-muted)',ink:'var(--c-ink)'};
 const tx=(s:string,x:number,y:number,size=3,col=C.ink,cls='')=>'<text class="'+cls+'" x="'+x+'" y="'+y+'" text-anchor="middle" font-size="'+size+'" font-weight="650" style="fill:'+col+'">'+s+'</text>';
 const box=(s:string,x:number,y:number,w=26,h=11,col=C.blue,cls='')=>'<g class="'+cls+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.6" fill="var(--c-surface)" stroke="'+col+'" stroke-width=".45"/>'+tx(s,x+w/2,y+h/2+1,2.6,col)+'</g>';
 const line=(x:number,y:number,x2:number,y2:number,col=C.blue,cls='')=>'<path class="'+cls+'" d="M'+x+','+y+' L'+x2+','+y2+'" stroke="'+col+'" stroke-width=".6" fill="none"/>';
 const svg=(s:string)=>'<svg class="layer" '+LAYER+'>'+s+'</svg>';
 let body='';
 if(mode==='problem'){
  body=svg(tx(l(0),80,23,4)+[0,1,2,3,4,5].map(i=>box(l(1+i),8+i*24,36,22,11,C.blue,'small sm'+i)).join('')+
   tx(l(7),139,30,3,C.blue,'six')+
   [0,1,2].map(i=>box(l(8+i),12+i*49,56,41,11,C.green,'big bg'+i)).join('')+tx(l(11),139,30,3,C.green,'three'));
 }else if(mode==='merge'){
  const a=[l(1),l(2),l(3)],b=[l(4),l(5),l(6),l(7),l(8)];
  body=svg(tx(l(0),80,22,3.5)+a.map((s,i)=>box(s,10+i*53,31,39,11,i===1?C.red:C.blue,'an a'+i)).join('')+
   b.map((s,i)=>box(s,6+i*30,54,28,11,i===2?C.red:C.blue,'bn b'+i)).join('')+
   [0,1].map(i=>line(49+i*53,36.5,63+i*53,36.5,C.blue,'ae')).join('')+
   [0,1,2,3].map(i=>line(34+i*30,59.5,36+i*30,59.5,C.blue,'be')).join('')+
   box(l(9),30,43,100,9,C.yellow,'gate')+tx(l(10),80,70,2.5,C.yellow,'check')+
   box(l(11),63,43,39,11,C.green,'shared')+line(49,36.5,63,48.5,C.green,'mergedge')+line(102,48.5,116,36.5,C.green,'mergedge')+tx(l(12),80,68,3,C.green,'result'));
 }else if(mode==='selection'){
  const pts=p.points as number[][];const x=(v:number)=>30+v*.4,y=(v:number)=>68-v*5;
  body=svg(line(30,68,146,68,C.muted)+line(30,68,30,22,C.muted)+tx(l(0),95,70,2.7,C.muted)+tx(l(1),20,20,2.7,C.muted)+
    '<rect class="dominated" x="'+x(pts[3]![0]!)+'" y="23" width="'+(146-x(pts[3]![0]!))+'" height="'+(y(pts[3]![1]!)-23)+'" fill="'+C.green+'" fill-opacity=".08"/>'+
    pts.map((v,i)=>'<g class="pt pt'+i+'"><circle cx="'+x(v[0]!)+'" cy="'+y(v[1]!)+'" r="1.5" fill="'+(i===3?C.green:i===2?C.red:C.blue)+'"/>'+tx(l(i+2),x(v[0]!)+3,y(v[1]!)-3,2.5,i===3?C.green:C.ink)+'</g>').join('')+
    tx(l(6),104,23,2.5,C.muted,'compare')+tx(l(7),80,18,2.3,C.green,'chosen'));
 }else if(mode==='train'){
  body=svg(box(l(0),10,28,56,14,C.green,'chosen')+box(l(1),94,28,56,14,C.red,'rejected')+
    line(38,42,65,59,C.green,'left-arrow')+line(122,42,95,59,C.red,'right-arrow')+
    box(l(2),58,53,44,13,C.blue,'dpo')+box(l(3),10,58,39,10,C.green,'nll')+line(38,42,29,58,C.green,'nll-arrow')+
    tx(l(4),105,70,2.8,C.muted,'message'));
 }else if(mode==='figure'){
  body=figureHtml('pipeline',new URL('../figures/pipeline.png',import.meta.url).href,figureMap as FigureMap,{x:21,y:19,w:58},'<div class="pfig-ring focus"></div>')+'<div class="figure-sub">'+l(0)+'</div>';
 }else if(mode==='results'){
  const values=p.values as number[],fx=(v:number)=>34+v*.95;
  body=svg(tx(l(0),80,20,3)+
   tx(l(1),22,31,2.7,C.muted)+line(34,32,129,32,'var(--c-line)')+line(34,29,fx(values[0]!),29,'#808080','accbase')+line(34,35,fx(values[1]!),35,C.green,'accnew')+
   tx(String(values[0])+'%',fx(values[0]!)+10,30,2.8,C.muted,'abval')+tx(String(values[1])+'%',fx(values[1]!)+10,36,2.8,C.green,'anval')+
   tx(l(2),83,49,3,C.green,'gain')+
   '<g class="costs">'+tx(l(3),24,45,2.6,C.muted)+line(40,43,140,43,'#808080','tokenbase')+line(40,48,40+100*values[3]!/values[2]!,48,C.green,'tokennew')+
   tx(String(values[2]),146,44,2.5,C.muted)+tx(String(values[3]),40+100*values[3]!/values[2]!+6,49,2.5,C.green)+
   tx(l(4),24,57,2.6,C.muted)+line(40,55,140,55,'#808080','stepbase')+line(40,60,40+100*values[5]!/values[4]!,60,C.green,'stepnew')+
   tx(String(values[4]),146,56,2.5,C.muted)+tx(String(values[5]),40+100*values[5]!/values[4]!+6,61,2.5,C.green)+'</g>');
 }
 frame(root,FIGURE_CSS+`
 .heading{position:absolute;left:5cqw;top:10cqh;font-size:2.85cqw;font-weight:800;line-height:1.2}
 .source{position:absolute;left:5cqw;top:78cqh;font-size:1.05cqw;color:var(--c-muted)}
 .figure-sub{position:absolute;left:18cqw;top:16cqh;font-size:1.6cqw}
 .focus{left:25%;top:1%;width:72%;height:40%;border-color:#309a59}
 `,brand('ChainPrune')+heads.map((s,i)=>'<div class="heading h'+i+'">'+escape(s)+'</div>').join('')+body+'<div class="source">'+escape(String(p.source??''))+'</div>');
 const tl=gsap.timeline();gsap.set('.heading',{autoAlpha:0});gsap.set('.h0',{autoAlpha:1});heads.slice(1).forEach((_,i)=>{tl.set('.h'+i,{autoAlpha:0},T(i+1,.005));tl.set('.h'+(i+1),{autoAlpha:1},T(i+1,.005));});
 const show=(s:string,k:number,f:number,d=.7)=>tl.to(s,{autoAlpha:1,duration:d,ease:'power2.out'},T(k,f));
 const draw=(s:string,k:number,f:number,d=.8)=>root.querySelectorAll<SVGGeometryElement>(s).forEach(el=>{const n=el.getTotalLength();gsap.set(el,{strokeDasharray:n,strokeDashoffset:n});tl.to(el,{strokeDashoffset:0,duration:d},T(k,f));});
 if(mode==='problem'){
  gsap.set('.small,.big,.six,.three',{autoAlpha:0});
  [0,1,2,3,4,5].forEach(i=>show('.sm'+i,0,.08+i*.1,.45));show('.six',0,.75,.3);
  [0,1,2].forEach(i=>{tl.to('.sm'+(2*i)+',.sm'+(2*i+1),{y:12,autoAlpha:.12,duration:.8},T(1,.15+i*.2));tl.fromTo('.bg'+i,{autoAlpha:0,y:-8},{autoAlpha:1,y:0,duration:.9,immediateRender:false},T(1,.25+i*.2));});
  tl.to('.six',{autoAlpha:.2,duration:.4},T(1,.65));show('.three',1,.83,.3);
 }else if(mode==='merge'){
  gsap.set('.an,.bn,.gate,.check,.shared,.result,.mergedge',{autoAlpha:0});
  [0,1,2].forEach(i=>show('.a'+i,0,.1+i*.12,.4));[0,1,2,3,4].forEach(i=>show('.b'+i,0,.2+i*.1,.4));draw('.ae,.be',0,.2,1.2);
  show('.gate',1,.08);tl.to('.a1,.b2',{scale:1.05,transformOrigin:'50% 50%',duration:.7},T(1,.3));show('.check',1,.55);tl.to('.a1 rect,.b2 rect',{stroke:C.green,duration:.8},T(1,.7));
  tl.to('.gate,.check',{autoAlpha:0,duration:.4},T(2,.02));
  tl.to('.a1',{y:12,duration:1.1},T(2,.2));tl.to('.b2',{x:-3,y:-11,duration:1.1},T(2,.2));
  tl.to('.a1,.b2',{autoAlpha:0,duration:.25},T(2,.4));show('.shared,.mergedge',2,.42,.6);
  tl.to('.bn,.be,.ae',{autoAlpha:.12,duration:1},T(2,.5));show('.result',2,.73);
 }else if(mode==='selection'){
  gsap.set('.pt,.chosen,.dominated,.compare',{autoAlpha:0});
  [0,1,2].forEach(i=>show('.pt'+i,0,.14+i*.2));show('.compare',0,.78);
  tl.fromTo('.pt3',{autoAlpha:0,x:-8,y:5},{autoAlpha:1,x:0,y:0,duration:.9,immediateRender:false},T(1,.17));show('.dominated',1,.45);
  tl.to('.pt2',{autoAlpha:.15,duration:.6},T(1,.6));show('.chosen',1,.76);
 }else if(mode==='train'){
  gsap.set('.chosen,.rejected,.dpo,.left-arrow,.right-arrow,.nll,.nll-arrow,.message',{autoAlpha:0});
  gsap.set('.chosen',{autoAlpha:1});tl.fromTo('.chosen',{x:-8},{x:0,duration:.8,immediateRender:false},T(0));tl.fromTo('.rejected',{autoAlpha:0,y:-8},{autoAlpha:1,y:0,duration:.8,immediateRender:false},T(0,.35));show('.left-arrow,.right-arrow,.dpo',0,.6);
  show('.nll,.nll-arrow',1,.3);show('.message',1,.65);
 }else if(mode==='figure'){
  tl.to('.pipeline .pfig__cam',{...view({x:.25,y:0,w:.75,h:.42}),duration:.8},T(0,.1));tl.to('.focus',{left:'25%',top:'1%',width:'72%',height:'40%',duration:.8},T(0,.1));tl.to('.pipeline .pfig__cam',{...view({x:.25,y:.45,w:.45,h:.53}),duration:1},T(0,.4));tl.to('.focus',{left:'25%',top:'45%',width:'45%',height:'53%',duration:1},T(0,.4));tl.to('.pipeline .pfig__cam',{...view({x:.71,y:.45,w:.27,h:.53}),duration:1},T(0,.72));tl.to('.focus',{left:'71%',top:'45%',width:'27%',height:'53%',duration:1},T(0,.72));
 }else if(mode==='results'){
  gsap.set('.costs,.gain,.abval,.anval',{autoAlpha:0});
  draw('.accbase',0,.15,1);show('.abval',0,.3,.3);draw('.accnew',0,.42,1);show('.anval',0,.57,.3);show('.gain',0,.73,.3);
  tl.to('.gain',{autoAlpha:0,duration:.3},T(1,.01));show('.costs',1,.1,.4);draw('.tokenbase,.stepbase',1,.12,.7);draw('.tokennew',1,.34,1);draw('.stepnew',1,.6,1);
 }
 tl.set({}, {},ctx.total/1000);return tl;
});
