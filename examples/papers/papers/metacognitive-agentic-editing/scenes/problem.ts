import {gsapScene} from '@lincyaw/addon-motion/scene'
import {box,C,finish,link,mount,start,svg,tx,wipe} from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 const rows=a.lines!.map((s,i)=>'<g class="r r'+i+'">'+tx(String(i+1).padStart(2,'0'),17,31+i*8,2.2,C.muted)+tx(s,25,31+i*8,3)+'</g>').join('');
 const art=box(12,23,75,39,'file')+tx(a.labels[0]!,16,20,2.5,C.muted)+rows+'<path class="wrong" d="M25,57 H69" stroke="'+C.red+'" stroke-width=".6"/>'+box(97,27,51,31,'check',C.blue)+tx(b.labels[0]!,101,34,2.7,C.blue,'start','check')+tx(b.labels[1]!,101,42,3,C.ink,'start','check')+tx(b.labels[2]!,101,50,3,C.green,'start','found')+link(86,48,97,42,'probe')+tx(b.labels[3]!,99,65,2.6,C.blue,'start','found');
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);
 ctx.gsap.set('.r,.wrong,.check,.found,.probe',{autoAlpha:0});
 shots[0]!.lines!.forEach((_,i)=>tl.to('.r'+i,{autoAlpha:1,duration:.35},T(0,.08+i*.17)));
 tl.set('.wrong',{autoAlpha:1},T(0,.65));wipe(ctx,tl,'.wrong',T(0,.65));
 tl.to('.check',{autoAlpha:1,duration:.3},T(1,.16));tl.set('.probe',{autoAlpha:1},T(1,.3));wipe(ctx,tl,'.probe',T(1,.3));
 tl.to('.found',{autoAlpha:1,y:0,duration:.4,stagger:.15},T(1,.62));return finish(ctx,tl)
})
