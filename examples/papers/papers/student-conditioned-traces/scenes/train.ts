import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!;
 let art=box(10,27,41,35,'',C.blue)+tx(a.labels[0]!,15,34,2.8,C.blue)+a.lines!.map((s,i)=>tx(s,15,42+i*7,2.5,i===2?C.green:C.ink)).join('');
 art+=box(74,27,31,17)+tx(a.labels[1]!,89.5,37,2.7,C.ink,'middle')+box(74,50,31,13,'extra',C.green)+tx(a.labels[2]!,89.5,58,2.5,C.green,'middle','extra')+box(124,34,26,20)+tx(a.labels[3]!,137,46,3,C.ink,'middle')+link(52,40,74,35,'main')+link(52,55,74,56,'ans',C.green)+link(105,35,124,43,'out')+link(105,56,124,45,'merge',C.green)+tx(a.details![0]!,71,65,2.4,C.muted,'start','detail');
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.main,.ans,.out,.merge,.extra,.detail',{autoAlpha:0});tl.set('.main',{autoAlpha:1},T(0,.18));wipe(ctx,tl,'.main',T(0,.18));tl.set('.out',{autoAlpha:1},T(0,.35));wipe(ctx,tl,'.out',T(0,.35));tl.to('.extra',{autoAlpha:1,duration:.3},T(0,.48));tl.set('.ans,.merge',{autoAlpha:1},T(0,.58));wipe(ctx,tl,'.ans,.merge',T(0,.58));tl.to('.detail',{autoAlpha:1,duration:.3},T(0,.77));return finish(ctx,tl)
})
