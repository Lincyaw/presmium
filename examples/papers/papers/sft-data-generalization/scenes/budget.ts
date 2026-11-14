import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, tx } from './visual.ts'
import type { Shot } from './visual.ts'

export default gsapScene(ctx=>{
  const shots=ctx.parameters.frames as unknown as Shot[], [a,b,c]=shots, ds=a!.details!, rows=a!.rollouts!;
  const {T}=clock(ctx.at,ctx.durations),{gsap}=ctx;
  const correct=rows.map((r,i)=>r.correct?i:-1).filter(i=>i>=0),wrong=rows.map((r,i)=>!r.correct?i:-1).filter(i=>i>=0), order=[...correct,...wrong];
  const sx=(i:number)=>32+i*10.5;
  const paper=(i:number,selected=false)=>{
    const x=selected?(i===correct[0]?sx(0):43):sx(i), y=selected?(i===correct[0]?28:18):50,col=rows[i]!.correct?C.orange:C.muted;
    return '<g class="'+(selected?'selected selected-':'obs obs-')+i+'" transform="translate('+x+' '+y+')">'+
      rect(0,0,8,13,C.surface,'paper',col)+
      '<path class="paper-lines" d="M1.5,3 h5 m-5,3 h4 m-4,3 h5" fill="none" stroke="'+col+'" stroke-width=".5"/>'+
      tx(rows[i]!.correct?'✓':'×',6,11.8,2.8,col,'middle','answer-mark')+
      (selected&&i===wrong[0]?'<g class="close-content">'+tx(ds[6]!,11.5,6,2.8,C.orange)+
        '<path d="M3,10 h17 M3,15 h17" fill="none" stroke="'+C.orange+'" stroke-width=".8"/>'+
        tx('×',11.5,26,5,C.muted)+'</g>':'')+'</g>';
  };
  let art=rect(29,26,91,18,C.surface,'sft-tray')+rect(29,49,91,16,C.surface,'pool-tray');
  art+=tx(ds[1]!,16,36,3.2)+tx(ds[2]!,16,58,2.8,C.ink,'middle','pool-label')+tx(ds[0]!,139,69,2.4,C.muted,'middle','demo-note');
  art+=rows.map((_,i)=>paper(i)).join('')+rows.map((_,i)=>paper(i,true)).join('');
  art+='<g class="budget-source">'+rect(29,17,46,7.5,C.surface,'',C.orange)+tx(ds[9]!,52,20.5,2.0,C.orange)+tx(ds[10]!,52,23.3,1.9,C.muted)+'</g>';
  art+='<path class="count-link" d="M120,56 H124 V21 H75 l2,-1.2 m-2,1.2 l2,1.2" fill="none" stroke="'+C.line+'" stroke-width=".45"/>';
  art+=tx(ds[11]!,139,48,2.4,C.muted,'middle','reference-caption');
  art+=tx(a!.labels[1]!,77,46.8,2.4,C.orange,'middle','one-description')+tx(a!.labels[2]!,77,69,2.4,C.pink,'middle','eight-description');
  art+=tx(a!.values![2]!.toFixed(1),139,36,5.2,C.orange,'middle','sft-score metric')+tx(ds[8]!,139,42,2.7,C.orange,'middle','sft-score-label')+
    tx(a!.values![3]!.toFixed(1),139,55,5.2,C.pink,'middle','rl-score')+tx(a!.labels[3]!,139,61,2.4,C.pink,'middle','rl-label');
  art+='<path class="score-gap" d="M151,37 h3 v15 h-3" fill="none" stroke="'+C.line+'" stroke-width=".4"/>';
  art+=rect(31.2,49.2,9.6,14.6,'none','picker',C.orange);
  art+=tx(ds[3]!,139,18,2.4,C.muted,'middle','global-label')+tx(String(b!.values![0]!.toLocaleString('en-US')),139,24,3.7,C.orange,'middle','global-correct metric');
  art+='<g class="aggregate">'+tx(c!.labels[0]!,45,49,2.8,C.orange)+tx(c!.labels[1]!,97,49,2.8,C.muted)+
    tx(c!.values![0]!.toLocaleString('en-US'),47,60,4.2,C.orange,'middle','count-correct')+tx('+',65,60,4.2)+tx(c!.values![1]!.toLocaleString('en-US'),85,60,4.2,C.muted,'middle','count-wrong')+
    tx('=',105,60,4.2)+tx(c!.values![2]!.toLocaleString('en-US'),131,60,5.5,C.ink,'middle','total metric')+tx(c!.labels[2]!,131,66,2.5,C.muted)+'</g>';
  art+=path(118,36,128,41,C.line,'zoom-link')+tx(ds[6]!,139,24,2.6,C.orange,'middle','close-label');
  mount(ctx.root,shots,svg(art));
  const tl=gsap.timeline();headings(ctx,tl,shots,T);
  gsap.set('.budget-source,.count-link,.reference-caption,.obs,.selected,.answer-mark,.close-content,.one-description,.eight-description,.picker,.global-label,.global-correct,.aggregate,.zoom-link,.close-label,.sft-score,.sft-score-label,.rl-score,.rl-label,.score-gap',{autoAlpha:0});
  gsap.set('.selected-'+correct[0],{autoAlpha:0});
  const counter=(selector:string,value:number,at:number,from=0,duration=.6,digits=0)=>tl.fromTo(selector,{textContent:from},{textContent:value,duration,ease:'none',immediateRender:false,modifiers:{textContent:(v:string)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits})}},at);
  tl.to('.sft-score,.sft-score-label',{autoAlpha:1,duration:.3},T(0,.06));
  tl.to('.rl-score,.rl-label',{autoAlpha:1,duration:.3},T(0,.20));draw(ctx,tl,'.score-gap',T(0,.29),.6);tl.to('.score-gap',{autoAlpha:1,duration:.1},T(0,.29));
  tl.to('.selected-'+correct[0]+',.one-description',{autoAlpha:1,duration:.3},T(0,.50));
  rows.forEach((_,i)=>{gsap.set('.obs-'+i,{attr:{transform:'translate(32 50)'}});tl.to('.obs-'+i,{autoAlpha:1,attr:{transform:'translate('+sx(i)+' 50)'},duration:.65,ease:'power3.out'},T(0,.67)+i*.07)});
  tl.to('.obs .answer-mark,.eight-description',{autoAlpha:1,duration:.25},T(0,.78));
  // The RL tray supplies counts, while the separate teacher source generates SFT trajectories.
  tl.to('.one-description,.eight-description,.score-gap',{autoAlpha:0,duration:.25},T(1));
  tl.to('.picker,.budget-source',{autoAlpha:1,duration:.2},T(1,.12));
  tl.to('.count-link,.reference-caption',{autoAlpha:1,duration:.2},T(1,.16));draw(ctx,tl,'.count-link',T(1,.16),.7);
  correct.slice(1).forEach((i,j)=>{
    const at=T(1,.23+j*.11);
    tl.to('.picker',{attr:{x:sx(i)-.8},duration:.5,ease:'power2.inOut'},at-.55);
    tl.to('.selected-'+i,{autoAlpha:1,duration:.01},at);
    tl.to('.selected-'+i,{attr:{transform:'translate('+sx(j+1)+' 28)'},duration:.8,ease:'power3.inOut'},at);
  });
  tl.to('.picker',{autoAlpha:0,duration:.2},T(1,.46));
  tl.to('.global-label,.global-correct',{autoAlpha:1,duration:.25},T(1,.47));
  counter('.global-correct',b!.values![0]!,T(1,.47),0,.65);
  counter('.sft-score',b!.values![1]!,T(1,.925),a!.values![2]!,.45,1);
  // Construct the remaining teacher trajectories to match the total count, then aggregate these same sheets.
  wrong.forEach((i,j)=>{
    const at=T(2,.025)+j*.09;
    tl.to('.selected-'+i,{autoAlpha:1,duration:.01},at);
    tl.to('.selected-'+i,{attr:{transform:'translate('+sx(correct.length+j)+' 28)'},duration:.85,ease:'power3.inOut'},at);
  });
  tl.to('.budget-source,.count-link,.reference-caption,.obs,.pool-tray,.pool-label,.global-label,.global-correct,.sft-score,.sft-score-label,.rl-score,.rl-label,.demo-note',{autoAlpha:0,duration:.35},T(2,.16));
  tl.to('.selected .paper-lines,.selected .answer-mark',{autoAlpha:0,duration:.25},T(2,.18));
  const cw=91*c!.values![0]!/c!.values![2]!, ww=91-cw;
  order.forEach((i,j)=>{
    const isCorrect=j<correct.length, rank=isCorrect?j:j-correct.length,w=(isCorrect?cw/correct.length:ww/wrong.length),x=29+(isCorrect?rank*w:cw+rank*w);
    tl.to('.selected-'+i,{attr:{transform:'translate('+x+' 28)'},duration:.7,ease:'power3.inOut'},T(2,.20));
    tl.to('.selected-'+i+' .paper',{attr:{width:w,height:14,rx:.15},fill:isCorrect?C.orange:C.line,stroke:C.surface,duration:.7,ease:'power3.inOut'},T(2,.20));
  });
  tl.to('.aggregate',{autoAlpha:1,duration:.3},T(2,.255));
  counter('.total',c!.values![2]!,T(2,.255),0,.65);
  // Pull one of the already-present wrong sheets out for a literal inspection.
  const wi=wrong[0]!, wx=29+cw, ww0=ww/wrong.length;
  tl.to('.selected-'+wi,{attr:{transform:'translate(127 29)'},duration:.75,ease:'power3.inOut'},T(2,.60));
  tl.to('.selected-'+wi+' .paper',{attr:{width:24,height:31,rx:1.2},fill:C.surface,stroke:C.muted,duration:.75},T(2,.60));
  tl.to('.selected-'+wi+' .close-content',{autoAlpha:1,duration:.3},T(2,.66));
  tl.to('.zoom-link',{autoAlpha:1,duration:.01},T(2,.64));draw(ctx,tl,'.zoom-link',T(2,.64),.6);
  tl.to('.selected-'+wi+' .close-content',{autoAlpha:0,duration:.25},T(2,.86));
  tl.to('.zoom-link',{autoAlpha:0,duration:.25},T(2,.86));
  tl.to('.selected-'+wi,{attr:{transform:'translate('+wx+' 28)'},duration:.65,ease:'power3.inOut'},T(2,.88));
  tl.to('.selected-'+wi+' .paper',{attr:{width:ww0,height:14,rx:.15},fill:C.line,stroke:C.surface,duration:.65},T(2,.88));
  return finish(ctx,tl);
})
