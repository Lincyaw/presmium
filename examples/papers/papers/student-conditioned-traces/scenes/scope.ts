import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!;
 let art='';a.labels!.forEach((s,i)=>{art+=box(10+i*49,29,42,16,'',i===1?C.blue:C.line)+tx(s,31+i*49,39,2.9,C.ink,'middle');if(i<2)art+=link(52+i*49,37,59+i*49,37,'edge')});art+=a.details!.map((s,i)=>tx(s,12,52+i*6,2.7,i===1?C.blue:C.muted,'start','d d'+i)).join('');
 mount(ctx,shots,svg(art),'.src{top:19cqh}');const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.d',{autoAlpha:0});wipe(ctx,tl,'.edge',T(0,.1));a.details!.forEach((_,i)=>tl.to('.d'+i,{autoAlpha:1,duration:.3},T(0,.25+i*.2)));return finish(ctx,tl)
})
