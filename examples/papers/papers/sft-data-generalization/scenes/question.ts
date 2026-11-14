import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, tx } from './visual.ts'
import type { Shot } from './visual.ts'

// A single question and the same solution sheets persist through both states.
// Opening the sheets shows the learning signal; the answer check precedes reward feedback.
export default gsapScene(ctx => {
  const shots=ctx.parameters.frames as unknown as Shot[], a=shots[0]!, b=shots[1]!, e=b.example!, d=b.details!;
  const {T}=clock(ctx.at,ctx.durations), {gsap}=ctx;
  const sheet=(i:number,top=false)=>{
    const x=top?75:75+i*9,y=top?25:49,cls=top?'ref':'sample sample-'+i;
    return '<g class="'+cls+'" transform="translate('+x+' '+y+')">'+rect(0,0,8,13,C.surface,'paper',top?C.orange:C.line)+
      '<path class="scribble" d="M1.6,3 h4.8 m-4.8,3 h4 m-4,3 h4.8" fill="none" stroke="'+(top?C.orange:C.muted)+'" stroke-width=".5"/>'+
      '<g class="worked">'+tx(e.lines[0]!,10,5,2.3)+tx(e.lines[1]!,10,10,2.3)+tx(top?e.answer:(i===3?e.lines[2]!:e.answer),10,15,2.8)+'</g>'+
      tx(i===3?'×':'✓',17,18,4,i===3?C.muted:C.green,'middle','verdict')+'</g>'
  };
  let art=rect(7,31,29,19)+tx(a.labels[0]!,21.5,37,2.7)+tx(e.question,21.5,44,3.6);
  art+=path(36,38,45,30,C.line,'branch-top')+path(36,41,45,54,C.line,'branch-bottom');
  art+=rect(45,22,23,16)+tx(a.labels[1]!,56.5,32,3.5)+rect(45,47,23,16)+tx(a.labels[2]!,56.5,57,3.5);
  art+=sheet(0,true)+Array.from({length:8},(_,i)=>sheet(i)).join('');
  art+=tx(a.details![0]!,109,35,3.0,C.orange,'middle','one-label')+tx(a.details![1]!,111,66,3.0,C.muted,'middle','eight-label');
  art+='<g class="follow">'+rect(76.5,26.7,17,4.7,'none','follow-window',C.orange)+'</g>';
  art+=path(75,34,68,30,C.orange,'teacher-link')+tx(d[0]!,110,29,3,C.orange,'middle','teacher-label');
  art+=tx(d[1]!,112,45,2.8,C.muted,'middle','generate-label');
  art+=path(136,63,64,63,C.green,'reward-link')+tx(d[2]!,104,66,2.7,C.green,'middle','reward-label');
  art+=rect(73,23,25,23,'none','trajectory-frame',C.orange)+tx(b.labels[4]!,80,70,2.4,C.muted,'middle','trajectory-label');
  mount(ctx.root,shots,svg(art),'.worked text{font-weight:650}');
  const tl=gsap.timeline();
  headings(ctx,tl,shots,T);
  gsap.set('.ref,.sample,.one-label,.eight-label,.worked,.verdict,.follow,.teacher-link,.teacher-label,.generate-label,.reward-link,.reward-label,.trajectory-frame,.trajectory-label',{autoAlpha:0});
  gsap.set('.sample',{x:-8});
  draw(ctx,tl,'.branch-top,.branch-bottom',T(0,.05),.6);
  tl.to('.ref',{autoAlpha:1,duration:.25},T(0,.31));
  tl.to('.one-label',{autoAlpha:1,duration:.3},T(0,.39));
  tl.to('.sample',{autoAlpha:1,x:0,duration:.5,stagger:.13,ease:'power2.out'},T(0,.53));
  tl.to('.eight-label',{autoAlpha:1,duration:.3},T(0,.76));
  // Unfold the given solution before following its individual learning targets.
  tl.to('.one-label,.eight-label',{autoAlpha:0,duration:.2},T(1));
  tl.to('.ref .paper',{attr:{width:21,height:21},duration:.7,ease:'power3.inOut'},T(1,.04));
  tl.to('.ref .scribble',{autoAlpha:0,duration:.15},T(1,.04));
  tl.to('.ref .worked,.teacher-label',{autoAlpha:1,duration:.3},T(1,.09));
  tl.to('.follow',{autoAlpha:1,duration:.15},T(1,.13));
  tl.to('.follow-window',{attr:{y:31.7},duration:.55,ease:'power2.inOut'},T(1,.18));
  tl.to('.follow-window',{attr:{y:36.7},duration:.55,ease:'power2.inOut'},T(1,.23));
  tl.to('.teacher-link',{autoAlpha:1,duration:.01},T(1,.26));draw(ctx,tl,'.teacher-link',T(1,.26),.65);
  // Keep three existing sampled sheets and open them; the others leave the close-up.
  tl.to('.sample-1,.sample-2,.sample-4,.sample-5,.sample-7',{autoAlpha:0,duration:.25},T(1,.34));
  [0,3,6].forEach((i,j)=>{
    tl.to('.sample-'+i,{x:j*25-i*9,duration:.65,ease:'power3.inOut'},T(1,.36));
    tl.to('.sample-'+i+' .paper',{attr:{width:21,height:21},duration:.65,ease:'power3.inOut'},T(1,.36));
    tl.to('.sample-'+i+' .scribble',{autoAlpha:0,duration:.15},T(1,.36));
    tl.to('.sample-'+i+' .worked',{autoAlpha:1,duration:.3},T(1,.40)+j*.18);
    tl.to('.sample-'+i+' .verdict',{autoAlpha:1,duration:.25},T(1,.54)+j*.23);
  });
  tl.to('.generate-label',{autoAlpha:1,duration:.3},T(1,.38));
  tl.to('.reward-link',{autoAlpha:1,duration:.01},T(1,.67));draw(ctx,tl,'.reward-link',T(1,.67),.9);
  tl.to('.reward-label',{autoAlpha:1,duration:.3},T(1,.72));
  tl.to('.follow,.teacher-label',{autoAlpha:.15,duration:.3},T(1,.82));
  tl.to('.trajectory-frame,.trajectory-label',{autoAlpha:1,duration:.3},T(1,.84));
  return finish(ctx,tl);
})
