import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'
import { FIGURE_CSS, figureHtml, view } from '../../../kit/figure.ts'
import map from '../figures/baselines.json'
import type { FigureMap } from '../../../kit/figure.ts'

export default gsapScene(ctx => {
 const {root,gsap,at,durations,parameters:p}=ctx, {T}=clock(at,durations);
 const q=(s:string)=>root.querySelector(s)!;
 const labels=p.labels as string[], heads=p.heads as string[];
 const l=(i:number)=>escape(labels[i]??'');
 const c={green:'#66bfa5',blue:'#7b9ccc',orange:'#ff936b',ink:'var(--c-ink)',muted:'var(--c-muted)'};
 const tx=(s:string,x:number,y:number,size=3,col=c.ink,cls='')=>'<text class="'+cls+'" x="'+x+'" y="'+y+'" text-anchor="middle" font-size="'+size+'" font-weight="650" style="fill:'+col+'">'+s+'</text>';
 const box=(s:string,x:number,y:number,w:number,h:number,col=c.blue,cls='')=>'<g class="'+cls+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.8" fill="var(--c-surface)" stroke="'+col+'" stroke-width=".45"/>'+tx(s,x+w/2,y+h/2+1,2.7,col)+'</g>';
 const line=(x:number,y:number,x2:number,y2:number,col=c.muted,cls='')=>'<path class="'+cls+'" d="M'+x+','+y+' L'+x2+','+y2+'" stroke="'+col+'" stroke-width=".5" fill="none"/>';
 let body='', mode=String(p.mode);
 if(mode==='gap'){
  body='<svg class="layer" '+LAYER+'>'+tx(l(0),80,22,3.5,c.ink,'puzzle')+box(l(1),8,35,29,12,c.ink,'start')+box(l(2),123,35,29,12,c.ink,'end')+line(37,41,123,41,c.orange,'jump')+tx(l(3),80,32,2.8,c.orange,'gapword')+
   [0,1,2].map(i=>box(l(i+4),42+i*25,35,22,12,c.green,'bridge b'+i)).join('')+
   [0,1,2,3].map(i=>line(37+i*25,41,42+i*25,41,c.green,'connect')).join('')+
   box(l(7),25,56,44,10,c.blue,'student')+box(l(8),91,56,44,10,c.green,'teacher')+tx(l(9),80,52,2.6,c.muted,'weights')+line(104,48,113,56,c.green,'refline')+tx(l(10),111,44,2.6,c.green,'ref')+'</svg>';
 }else if(mode==='mix'){
  body='<svg class="layer" '+LAYER+'>'+box(l(0),9,22,35,12,c.blue,'student')+box('',102,22,49,12,c.green,'teacher')+tx(l(1),126,17,2.7,c.green)+tx(l(2),126,21,2.1,c.green)+line(45,28,100,28,c.muted)+
    [0,1,2].map(i=>box(l(3+i),55,22,32,12,i===1?c.orange:c.blue,'token t'+i)).join('')+
    box(l(6),103,39,31,12,c.green,'replacement')+tx(l(7),79,44,2.6,c.green,'accept')+tx(l(8),79,44,2.6,c.orange,'reject')+
    tx(l(9),28,60,2.8,c.muted)+[0,1,2].map(i=>'<rect x="'+(50+i*33)+'" y="51" width="31" height="15" rx="1.5" fill="none" stroke="var(--c-line-strong)" stroke-dasharray="1 1"/>').join('')+
    tx(l(10),80,73,2.5,c.muted,'complete')+'</svg>';
 }else if(mode==='contrast'){
  body='<svg class="layer" '+LAYER+'>'+box(l(0),8,22,61,12,c.green,'full')+box(l(1),91,22,61,12,c.orange,'partial')+
   [0,1,2,3,4].map(i=>'<g class="detail d'+i+'"><rect x="17" y="'+(36+i*5)+'" width="42" height="4.5" rx=".6" fill="'+c.green+'" fill-opacity=".1"/>'+tx(l(6+i),38,39.3+i*5,2.6,c.green)+'</g><g class="sparse s'+i+'"><rect x="100" y="'+(36+i*5)+'" width="42" height="4.5" rx=".6" fill="'+c.orange+'" fill-opacity=".1"/>'+tx(l(6+i),121,39.3+i*5,2.6,c.orange)+'</g>').join('')+
   tx(l(2),38,46,3,c.green,'reason')+tx(l(3),121,46,3,c.orange,'shortcut')+
   line(38,49,72,58,c.green,'goodline')+line(121,49,89,58,c.orange,'badline')+
   box(l(4),58,53,44,9,c.blue,'learner')+tx(l(5),80,67,2.4,c.muted,'goal')+'</svg>';
 }else if(mode==='evidence'){
  const fig=figureHtml('f',new URL('../figures/baselines.png',import.meta.url).href,map as FigureMap,{x:25,y:21,w:50},'<div class="pfig-ring focus"></div>');
  body=fig+'<div class="figlabels">'+l(0)+'</div><div class="metric">'+l(1)+'</div><svg class="layer" '+LAYER+'><g class="bars">'+tx(l(2),80,22,3.2)+tx(l(9),80,18,2.3,c.muted)+
    [0,20,40,60].map(v=>line(22,65-v*.52,148,65-v*.52,'var(--c-line)')+tx(String(v),17,66-v*.52,2.3,c.muted)).join('')+
    (p.values as number[]).map((v,i)=>'<rect class="bar bar'+i+'" x="'+(32+i*28)+'" y="'+(65-v*.52)+'" width="15" height="'+(v*.52)+'" fill="'+(i%2?c.green:'#808080')+'"/>'+tx(String(v),39.5+i*28,62-v*.52,3,i%2?c.green:c.ink,'value v'+i)).join('')+tx(l(7),53,27,3,c.ink,'k128')+tx(l(8),109,47,3,c.ink,'k1')+'</g></svg>';
 }else if(mode==='limits'){
  body='<svg class="layer" '+LAYER+'>'+box(l(0),7,25,43,15,c.blue,'data a')+box(l(1),7,49,43,15,c.green,'data b')+line(50,32,75,43,c.blue,'la')+line(50,56,75,43,c.green,'lb')+box(l(2),75,36,35,14,c.green,'transform')+line(110,43,131,43,c.green,'lc')+box(l(3),128,36,26,14,c.blue,'capable')+tx(l(4),114,65,2.8,c.orange,'weak')+'</svg>';
 }
 frame(root,FIGURE_CSS+`
  .heading{position:absolute;left:5cqw;top:10cqh;font-size:2.9cqw;font-weight:800}
  .source{position:absolute;left:5cqw;top:76cqh;font-size:1.05cqw;color:var(--c-muted)}
  .layer{font-variant-numeric:tabular-nums}.figlabels{position:absolute;left:25cqw;top:17cqh;font-size:1.6cqw}
  .metric{position:absolute;left:25cqw;top:72cqh;font-size:1.5cqw;color:var(--c-muted)}
  .focus{left:8%;top:3%;width:39%;height:45%}
  ${mode==='evidence'?'.source,.metric{display:none}':''}
 `,brand('DAIL')+heads.map((s,i)=>'<div class="heading h'+i+'">'+escape(s)+'</div>').join('')+body+'<div class="source">'+escape(String(p.source??''))+'</div>');
 const tl=gsap.timeline();gsap.set('.heading',{autoAlpha:0});gsap.set('.h0',{autoAlpha:1});
 heads.slice(1).forEach((_,i)=>{tl.set('.h'+i,{autoAlpha:0},T(i+1,.005));tl.set('.h'+(i+1),{autoAlpha:1},T(i+1,.005));});
 const show=(s:string,k:number,f:number,d=.7)=>tl.to(s,{autoAlpha:1,duration:d,ease:'power2.out'},T(k,f));
 if(mode==='gap'){
  gsap.set('.bridge,.connect,.student,.teacher,.weights,.ref,.refline',{autoAlpha:0});
  tl.fromTo('.jump',{scaleX:0,transformOrigin:'0% 50%'},{scaleX:1,duration:1.3,immediateRender:false},T(0,.25));
  tl.to('.gapword',{y:-3,duration:.5},T(0,.6));
  tl.to('.jump,.gapword',{autoAlpha:0,duration:.4},T(1,.1));
  [0,1,2].forEach(i=>tl.fromTo('.b'+i,{autoAlpha:0,y:9},{autoAlpha:1,y:0,duration:.7,immediateRender:false},T(1,.18+i*.2)));
  show('.connect',1,.72,.5);
  tl.to('.start,.end,.bridge,.connect',{y:-12,scale:.82,transformOrigin:'50% 50%',duration:.9},T(2,.08));
  tl.to('.puzzle',{autoAlpha:0,duration:.4},T(2,.03));show('.weights',2,.25);show('.student,.teacher',2,.4);show('.ref,.refline',2,.62);
 }else if(mode==='mix'){
  gsap.set('.token,.replacement,.accept,.reject,.complete',{autoAlpha:0});
  const finish=(i:number,k:number,sel:string)=>tl.to(sel,{x:(50+i*33-55),y:29,duration:.9,ease:'power3.inOut'},T(k,.65));
  show('.t0',0,.1);tl.to('.t0',{x:36,duration:1},T(0,.23));show('.accept',0,.5,.2);finish(0,0,'.t0');
  tl.set('.accept',{autoAlpha:0},T(1));show('.t1',1,.08);tl.to('.t1',{x:36,duration:.8},T(1,.2));show('.reject',1,.36,.2);tl.to('.t1',{autoAlpha:0,y:6,duration:.45},T(1,.48));show('.replacement',1,.52,.3);tl.to('.replacement',{x:-20,y:12,duration:1},T(1,.65));
  tl.set('.reject',{autoAlpha:0},T(2));show('.t2',2,.08);tl.to('.t2',{x:36,duration:.8},T(2,.22));show('.accept',2,.4,.2);finish(2,2,'.t2');show('.complete',2,.86,.4);
 }else if(mode==='contrast'){
  gsap.set('.reason,.shortcut,.goodline,.badline,.learner,.goal',{autoAlpha:0});
  tl.to('.s1,.s3',{autoAlpha:0,scaleX:0,duration:.8},T(0,.4));
  tl.set('.detail,.sparse',{autoAlpha:0},T(1,.02));tl.set('.reason,.shortcut',{autoAlpha:1},T(1,.02));
  show('.learner,.goodline,.badline',1,.12);
  tl.to('.badline,.shortcut',{autoAlpha:.18,duration:1},T(1,.5));
  tl.to('.reason',{scale:1.1,transformOrigin:'50% 50%',duration:1},T(1,.5));show('.goal',1,.76);
 }else if(mode==='evidence'){
  gsap.set('.bars',{autoAlpha:0});
  tl.to('.focus',{left:'8%',top:'3%',width:'39%',height:'45%',duration:.4},T(0,.1));
  tl.to('.focus',{left:'7%',top:'68%',width:'18%',height:'23%',duration:1},T(0,.38));
  tl.to('.focus',{left:'87%',top:'4%',width:'12%',height:'37%',duration:1.3},T(0,.63));
  tl.to('.f,.figlabels,.metric',{autoAlpha:0,duration:.4},T(1,.02));show('.bars',1,.02,.4);
  gsap.set('.bar,.value,.k128,.k1',{autoAlpha:0});
  [0,1].forEach((i)=>{tl.fromTo('.bar'+i,{scaleY:0,transformOrigin:'50% 100%',autoAlpha:1},{scaleY:1,duration:1.1,immediateRender:false},T(1,.16+i*.1));show('.v'+i,1,.36+i*.05,.3);});
  show('.k128',1,.12,.3);
  [2,3].forEach((i)=>{tl.fromTo('.bar'+i,{scaleY:0,transformOrigin:'50% 100%',autoAlpha:1},{scaleY:1,duration:.8,immediateRender:false},T(1,.58+(i-2)*.08));show('.v'+i,1,.72+(i-2)*.04,.3);});show('.k1',1,.54,.3);
 }else if(mode==='limits'){
  gsap.set('.b,.lb,.weak',{autoAlpha:0});
  tl.fromTo('.a',{x:-5},{x:0,duration:.7,immediateRender:false},T(0,.12));
  show('.b,.lb',0,.36);show('.weak',0,.68);
 }
 tl.set({}, {},ctx.total/1000);return tl;
});
