import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!;
 let art='<g class="data">'+box(11,28,41,30,'',C.blue)+tx(a.labels[0]!,15,35,3,C.blue)+a.lines!.map((s,i)=>tx(s,15,42+i*6,2.4,C.muted)).join('')+'</g>'+box(65,34,28,20)+tx(a.labels[1]!,79,46,3,C.ink,'middle')+link(53,44,65,44,'in')+link(93,44,107,44,'out')+box(108,28,42,31)+tx(a.labels[2]!,112,35,3);
 art+=a.details!.map((s,i)=>tx(s,112,42+i*7,2.5,i===1?C.ink:C.blue,'start','o o'+i)).join('');
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.in,.out,.o',{autoAlpha:0});
 tl.to('.data',{x:10,duration:.7,ease:'power2.inOut'},T(0,.18));tl.set('.in',{autoAlpha:1},T(0,.3));wipe(ctx,tl,'.in',T(0,.3));tl.set('.out',{autoAlpha:1},T(0,.46));wipe(ctx,tl,'.out',T(0,.46));[0,1,2].forEach(i=>tl.to('.o'+i,{autoAlpha:1,duration:.35},T(0,.58+i*.1)));return finish(ctx,tl)
})
