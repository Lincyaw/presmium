import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 let art=box(116,28,34,24)+tx(a.labels[0]!,133,35,2.6,C.blue,'middle')+tx(a.labels[1]!,133,43,2.3,C.muted,'middle')+tx(a.labels[2]!,133,49,2.3,C.muted,'middle');
 [0,1,2].forEach(i=>{art+='<g class="candidate c'+i+'">'+box(10+i*34,29,28,24,'',i?C.blue:C.muted)+tx(a.details![i]!,24+i*34,36,2.5,C.ink,'middle')+tx(a.lines![i]!,24+i*34,45,2.5,C.muted,'middle','readline')+tx(b.details![i]!,24+i*34,45,2.5,C.blue,'middle','rank rank'+i)+tx(i===0?'×':'✓',24+i*34,50,3,i===0?C.red:C.green,'middle','verdict v'+i)+'</g>';art+=link(38+i*34,40,116,40,'read r'+i,C.blue)});
 art+=box(96,50,50,15,'tray',C.green)+tx(b.labels[0]!,121,58,2.8,C.green,'middle','tray')+tx(b.labels[1]!,12,63,2.6,C.muted,'start','fallback')+box(78,27,28,28,'selected',C.green,'none');
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.verdict,.read,.tray,.fallback,.selected,.rank',{autoAlpha:0});
 [0,1,2].forEach(i=>{tl.set('.r'+i,{autoAlpha:1},T(0,.15+i*.17));wipe(ctx,tl,'.r'+i,T(0,.15+i*.17),.55);tl.to('.v'+i,{autoAlpha:1,duration:.25},T(0,.22+i*.17));tl.to('.r'+i,{autoAlpha:0,duration:.2},T(0,.29+i*.17))});
 tl.to('.c0',{autoAlpha:.22,y:8,duration:.6},T(0,.75));
 tl.to('.readline',{autoAlpha:0,duration:.2},T(1,.08));tl.to('.rank1,.rank2',{autoAlpha:1,duration:.3},T(1,.13));tl.to('.selected',{autoAlpha:1,duration:.3},T(1,.16));tl.to('.tray',{autoAlpha:1,duration:.3},T(1,.25));tl.to('.c2',{x:23,y:9,scale:.68,transformOrigin:'50% 50%',duration:.9,ease:'power3.inOut'},T(1,.43));tl.to('.selected',{autoAlpha:0,duration:.25},T(1,.43));tl.to('.fallback',{autoAlpha:1,duration:.35},T(1,.76));return finish(ctx,tl)
})
